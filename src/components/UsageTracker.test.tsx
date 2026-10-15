import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { UsageTracker } from "./UsageTracker";
import { resetUsage, trackFeature } from "@/lib/usage";

const ID = "3f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f";
let pathname = "/home";
let params: Record<string, string> = {};
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useParams: () => params,
}));

let fetchSpy: ReturnType<typeof vi.fn>;

/** Every event sent so far, flattened across batches. */
function sent(): { event: string; props: Record<string, unknown> }[] {
  return fetchSpy.mock.calls.flatMap(
    ([, init]) => JSON.parse(init.body as string).events
  );
}

function at(path: string, routeParams: Record<string, string> = {}) {
  pathname = path;
  params = routeParams;
}

beforeEach(() => {
  resetUsage();
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
  at("/home");
});
afterEach(() => {
  cleanup();
  resetUsage();
  vi.unstubAllGlobals();
});

test("counts each page once by its pattern and flushes it on the next route", () => {
  const view = render(
    <StrictMode>
      <UsageTracker />
    </StrictMode>
  );
  fetchSpy.mockClear();
  trackFeature("protocol.play");
  at(`/protocols/${ID}`, { id: ID });
  view.rerender(
    <StrictMode>
      <UsageTracker />
    </StrictMode>
  );
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  view.unmount();
  const events = sent();
  expect(events.filter((e) => e.event === "page.viewed")).toEqual([
    expect.objectContaining({ props: { route: `/protocols/[id]` } }),
  ]);
  expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain(ID);
});

test("a second page of the same pattern is a second view", () => {
  at(`/recordings/${ID}`, { id: ID });
  const view = render(<UsageTracker />);
  const other = "0f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f";
  at(`/recordings/${other}`, { id: other });
  view.rerender(<UsageTracker />);
  view.unmount();
  expect(sent().map((e) => e.props.route)).toEqual([
    "/recordings/[id]",
    "/recordings/[id]",
  ]);
});

test("the run sends nothing, and entering it flushes what came before", () => {
  const view = render(<UsageTracker />);
  at(`/protocols/${ID}/run`, { id: ID });
  view.rerender(<UsageTracker />);
  expect(sent().map((e) => e.props.route)).toEqual(["/home"]);
  trackFeature("run.anything");
  window.dispatchEvent(new Event("pagehide"));
  view.unmount();
  expect(fetchSpy).toHaveBeenCalledTimes(1);

  at("/home");
  const back = render(<UsageTracker />);
  back.unmount();
  expect(sent().map((e) => e.props.route)).toEqual(["/home", "/home"]);
});
