import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import messages from "../../../messages/en.json";
import type { RunnerState } from "@/lib/protocol/commands";
import { CommandBar, PlanTimeline } from "./ConsolePanels";

afterEach(() => cleanup());

const t = messages.console;

const state = (stepIndex: number): RunnerState => ({
  status: "running",
  stepIndex,
  stepId: `s${stepIndex}`,
  pausePending: false,
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
