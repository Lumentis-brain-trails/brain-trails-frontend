import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import messages from "../../../messages/en.json";
import type { RunnerState } from "@/lib/protocol/commands";
import { CommandBar, HeadbandPanel, PlanTimeline } from "./ConsolePanels";

afterEach(() => cleanup());

const t = messages.console;

const state = (stepIndex: number): RunnerState => ({
  status: "running",
  stepIndex,
  stepId: `s${stepIndex}`,
  pausePending: false,
  extendable: false,
  attempt: 0,
  message: null,
});

test("End and Skip are sent once per block, until the runner reports the next one", () => {
  const send = vi.fn();
  const { rerender } = render(
    <CommandBar state={state(0)} disabled={false} send={send} />,
    { wrapper: IntlEn }
  );
  const end = screen.getByRole("button", { name: t.commands.endBlock });
  const skip = screen.getByRole("button", { name: t.commands.skipBlock });
  fireEvent.click(end);
  fireEvent.click(end);
  fireEvent.click(skip);
  expect(send.mock.calls).toEqual([["end_block"]]);
  expect(end).toBeDisabled();
  expect(skip).toBeDisabled();

  // the runner moved on: the next block can be ended
  rerender(<CommandBar state={state(1)} disabled={false} send={send} />);
  expect(end).toBeEnabled();
  fireEvent.click(skip);
  expect(send.mock.calls).toEqual([["end_block"], ["skip_block"]]);
});

test("a lost participant window is not shown as running", () => {
  render(<PlanTimeline labels={["One", "Two"]} state={state(1)} lost />, {
    wrapper: IntlEn,
  });
  expect(screen.getByText(t.plan.lost)).toBeInTheDocument();
  expect(screen.queryByText(t.plan.running)).not.toBeInTheDocument();
});

test("Repeat is sent once per attempt; +30 s only on a timed rest", () => {
  const send = vi.fn();
  const { rerender } = render(
    <CommandBar state={state(0)} disabled={false} send={send} />,
    { wrapper: IntlEn }
  );
  const repeat = screen.getByRole("button", { name: t.commands.repeatBlock });
  const extend = screen.getByRole("button", { name: "+30 s rest" });
  expect(extend).toBeDisabled();
  fireEvent.click(repeat);
  fireEvent.click(repeat);
  expect(send.mock.calls).toEqual([["repeat_block"]]);
  expect(repeat).toBeDisabled();

  // the runner reports the new attempt, on a rest it can lengthen
  rerender(
    <CommandBar
      state={{ ...state(0), attempt: 1, extendable: true }}
      disabled={false}
      send={send}
    />
  );
  expect(repeat).toBeEnabled();
  fireEvent.click(extend);
  expect(send.mock.calls.at(-1)).toEqual(["extend_rest"]);
});

test("the headband panel shows contact and how many packets were lost", () => {
  const quality = Object.fromEntries(
    ["TP9", "AF7", "AF8", "TP10"].map((c) => [c, { level: "good" }])
  ) as never;
  render(
    <HeadbandPanel
      quality={quality}
      getRecent={() => ({}) as never}
      connected
      packets={970}
      lostPackets={30}
      packetRate={21.4}
    />,
    { wrapper: IntlEn }
  );
  const line = screen.getByText(/Packets lost: 30 \(3\.0 %\) · 21 packets\/s/);
  // over 2 %: shown in red
  expect(line.className).toContain("text-danger");
});
