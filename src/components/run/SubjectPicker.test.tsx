import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { SELECTED_WORKSPACE_KEY, resetPinnedWorkspace } from "@/lib/workspace";
import { type RunTarget, SubjectPicker, startOptions } from "./SubjectPicker";

const responses: Record<string, unknown> = {};
vi.mock("@/lib/api", () => ({
  api: {
    get: async (path: string) => {
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      return key ? responses[key] : [];
    },
  },
}));

const CLINIC = {
  id: "c",
  kind: "practice",
  name: "Studio Uno",
  status: "active",
  relations: ["member"],
};
const PERSONAL = {
  id: "p",
  kind: "personal",
  name: "Personal",
  status: "active",
  relations: ["owner"],
};
const subject = (id: string, name: string, consent: boolean) => ({
  id,
  code: `P-${id}`,
  display_name: name,
  readable: true,
  consent_at: consent ? "2026-10-20T00:00:00Z" : null,
  archived_at: null,
});

const report = vi.fn();
const seen = (): RunTarget => report.mock.lastCall?.[0] ?? {};
function Harness() {
  const [target, setTarget] = useState<RunTarget>({});
  useEffect(() => report(target), [target]);
  return <SubjectPicker protocolId="p1" value={target} onChange={setTarget} />;
}

function renderPicker() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  resetPinnedWorkspace();
  report.mockReset();
  for (const k of Object.keys(responses)) delete responses[k];
  responses["config"] = {
    features: { workspaces_multi: true, assignments: true },
  };
  responses["workspaces/c/subjects"] = [
    subject("a", "Maria", true),
    subject("b", "Luca", false),
  ];
  responses["workspaces/c/assignments"] = [
    { id: "as1", open: true, runs_allowed: 3, runs_done: 1 },
  ];
});

test("a private user's Play has no picker", async () => {
  responses["workspaces"] = [PERSONAL];
  renderPicker();
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("Who is being recorded?")).toBeNull();
});

test("in a clinic: myself or a patient, consent first, the assignment counted", async () => {
  responses["workspaces"] = [PERSONAL, CLINIC];
  window.localStorage.setItem(SELECTED_WORKSPACE_KEY, "c");
  renderPicker();
  const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
  await screen.findByRole("option", { name: "Maria · P-a" });
  const luca = screen.getByRole("option", {
    name: "Luca (consent not attested)",
  }) as HTMLOptionElement;
  expect(luca.disabled).toBe(true);

  fireEvent.change(select, { target: { value: "a" } });
  const box = (await screen.findByRole("checkbox")) as HTMLInputElement;
  await waitFor(() => expect(box.checked).toBe(true));
  expect(screen.getByText(/2 left/)).toBeTruthy();
  expect(startOptions(seen())).toEqual({ subjectId: "a", assignmentId: "as1" });

  fireEvent.click(box);
  await waitFor(() => expect(startOptions(seen())).toEqual({ subjectId: "a" }));

  fireEvent.change(select, { target: { value: "" } });
  await waitFor(() => expect(startOptions(seen())).toEqual({}));
});
