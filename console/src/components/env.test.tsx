import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { APPS } from "@console/apps";
import { IntlEn } from "@console/i18n/testing";
import type { EnvsOut } from "@console/lib/env";
import { SnapshotPanel } from "./SnapshotPanel";
import { EnvBand, EnvProvider, EnvSwitch } from "./env";

const ENVS: EnvsOut = {
  home: "dev",
  envs: [
    { id: "dev", available: true },
    { id: "beta", available: false },
    { id: "prod", available: true },
  ],
};

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          key: "x",
          payload: {
            pending: 3,
            by_decision: {},
            pending_wants_beta: 1,
            organisations_pending: 0,
          },
          age_seconds: 5,
        }),
        { status: 200 }
      )
  );
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(children: ReactNode, client = new QueryClient()) {
  return (
    <IntlEn>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </IntlEn>
  );
}

const headersOf = (i: number) =>
  (fetchSpy.mock.calls[i] as [string, RequestInit])[1]?.headers as
    Record<string, string> | undefined;

test("the switch offers every environment; one without a read connection is disabled and says why", () => {
  const onChange = vi.fn();
  render(wrap(<EnvSwitch envs={ENVS} value="dev" onChange={onChange} />));
  const radios = screen.getAllByRole("radio");
  expect(radios.map((r) => r.textContent)).toEqual([
    "Dev",
    expect.stringContaining("Beta"),
    "Prod",
  ]);
  const beta = screen.getByRole("radio", { name: /Beta/ });
  expect(beta).toBeDisabled();
  expect(beta).toHaveAccessibleName(/no read connection/);
  fireEvent.click(screen.getByRole("radio", { name: "Prod" }));
  expect(onChange).toHaveBeenCalledWith("prod");
});

test("a prod page wears prod on its header, with what it may do", () => {
  render(
    wrap(
      <EnvBand env="prod" home="dev">
        <h1>Statistics</h1>
      </EnvBand>
    )
  );
  const band = screen.getByText("Statistics").closest("[data-env]");
  expect(band).toHaveAttribute("data-env", "prod");
  expect(band?.className).toContain("bg-danger-soft");
  expect(screen.getByText("Prod")).toBeInTheDocument();
  expect(screen.getByText(/Read only/)).toBeInTheDocument();
});

test("a panel reads its environment, and each environment has its own snapshot", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (env: "dev" | "prod") => (
    <EnvProvider env={env} home="dev">
      <SnapshotPanel<{ pending: number }>
        panelKey="beta-testers.pending"
        title={`panel ${env}`}
      >
        {(p) => <p>{`${env}: ${p.pending}`}</p>}
      </SnapshotPanel>
    </EnvProvider>
  );
  const { rerender } = render(wrap(panel("prod"), client));
  expect(await screen.findByText("prod: 3")).toBeInTheDocument();
  expect(headersOf(0)?.["X-Ops-Env"]).toBe("prod");
  rerender(wrap(panel("dev"), client));
  expect(await screen.findByText("dev: 3")).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(headersOf(1)?.["X-Ops-Env"]).toBe("dev");

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
  const [url, init] = fetchSpy.mock.calls[2] as [string, RequestInit];
  expect(url).toBe("/api/ops/snapshots/beta-testers.pending/refresh");
  expect(init.method).toBe("POST");
  expect(headersOf(2)?.["X-Ops-Env"]).toBe("dev");
});

test("off home, Beta testers and Moderation read counts only: no product call, no action, a word on where to act", async () => {
  for (const slug of ["beta-testers", "moderation"]) {
    fetchSpy.mockClear();
    const Page = APPS[slug].Page;
    render(
      wrap(
        <EnvProvider env="prod" home="dev">
          <Page semver="1.0.0" />
        </EnvProvider>
      )
    );
    expect(
      screen.getByText(/act on the console's home environment \(dev\) only/)
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.startsWith("/api/ops/snapshots/"))).toBe(true);
    expect(screen.queryByRole("radiogroup", { name: "Sections" })).toBeNull();
    cleanup();
  }
});

test("on home, Beta testers is the board, through the product", async () => {
  const Page = APPS["beta-testers"].Page;
  render(
    wrap(
      <EnvProvider env="dev" home="dev">
        <Page semver="1.0.0" />
      </EnvProvider>
    )
  );
  expect(
    screen.getByRole("radiogroup", { name: "Sections" })
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).startsWith("/api/product/"))
    ).toBe(true)
  );
});
