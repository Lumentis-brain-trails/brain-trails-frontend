import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TaskPanel, type TaskBlock } from "./TaskPanel";

afterEach(() => cleanup());

const times = Array.from({ length: 100 }, (_, i) => -200 + i * 10);

function block(overrides: Partial<TaskBlock> = {}): TaskBlock {
  return {
    key: "focus#0",
    block_id: "focus",
    label: "Hold your focus",
    behaviour: {
      n: 240,
      n_go: 204,
      n_nogo: 36,
      n_excluded: 2,
      n_practice: 0,
      hit_rate: 0.97,
      omission_rate: 0.03,
      commission_rate: 0.28,
      correct_rejection_rate: 0.72,
      d_prime: 2.41,
      criterion: -0.62,
      rt: {
        median_ms: 391.4,
        mad_ms: 48.2,
        mean_ms: 410,
        sd_ms: 95,
        cv: 0.23,
        commission_median_ms: 340,
        anticipation_rate: 0,
        slow_rate: 0.06,
      },
      ex_gaussian: { mu_ms: 330, sigma_ms: 35, tau_ms: 81.6 },
      post_error_slowing_ms: 42.3,
      rt_slope_ms_per_min: 6.5,
      quarters: [0.99, 0.98, 0.96, 0.94].map((hit_rate, i) => ({
        n: 60,
        n_go: 51,
        n_nogo: 9,
        hit_rate,
        commission_rate: 0.2 + i * 0.05,
        median_rt_ms: 380 + i * 10,
      })),
      nogo_types: {},
      flags: [],
    },
    erp: {
      channels: ["AF7", "AF8"],
      reject_uv: 150,
      min_epochs: { stimulus: 15, response: 6 },
      stimulus: {
        times_ms: times,
        conditions: {
          nogo_correct: { n: 24, n_rejected: 2, wave_uv: times.map(() => -2) },
          go_hit: { n: 180, n_rejected: 18, wave_uv: times.map(() => 0.5) },
        },
        n2: { nogo_correct: -3.1, go_hit: -0.4, difference: -2.7 },
        p3_frontal: { nogo_correct: 1, go_hit: 0.8, difference: 0.2 },
      },
      response: {
        times_ms: times,
        conditions: {
          error: { n: 4, n_rejected: 1, wave_uv: null },
          correct: { n: 180, n_rejected: 18, wave_uv: times.map(() => 0.2) },
        },
        ern: { error: null, correct: 0.2, difference: null },
        pe: { error: null, correct: 0.1, difference: null },
      },
    },
    prestimulus: {
      n_hits: 190,
      n_misses: 6,
      rho: 0.31,
      p_value: 0.0002,
      log_alpha: { fast: 0.8, slow: 1.1, miss: 1.3 },
    },
    ...overrides,
  };
}

test("rates, sensitivity, bias and speed are shown side by side", () => {
  render(<TaskPanel block={block()} />);
  expect(screen.getByText(/240 trials \(204 go, 36 no-go\)/)).toBeTruthy();
  expect(screen.getByText("97%")).toBeTruthy();
  expect(screen.getByText("28%")).toBeTruthy();
  expect(screen.getByText("2.41")).toBeTruthy();
  expect(screen.getByText("-0.62")).toBeTruthy();
  expect(screen.getByText("391 ms")).toBeTruthy();
  expect(screen.getByText("82 ms")).toBeTruthy();
  expect(screen.getByText("+42 ms")).toBeTruthy();
  expect(screen.getByText(/speed drift \+7 ms\/min/)).toBeTruthy();
  expect(screen.getAllByRole("row")).toHaveLength(5);
});

test("a waveform is drawn only when the backend sent one", () => {
  render(<TaskPanel block={block()} />);
  expect(
    screen
      .getByRole("img", { name: /Around the target/ })
      .querySelectorAll("polyline")
  ).toHaveLength(2);
  expect(
    screen.getByText(/N2 \(200–350 ms\), difference: -2\.7 µV/)
  ).toBeTruthy();
  // four error epochs are under the minimum: a count, one line, and no ERN number
  expect(
    screen
      .getByRole("img", { name: /Around the press/ })
      .querySelectorAll("polyline")
  ).toHaveLength(1);
  expect(screen.getByText(/False dock: 4 epochs \(needs 6\)/)).toBeTruthy();
  expect(screen.queryByText(/ERN \(/)).toBeNull();
});

test("flags are spelled out, and pre-stimulus alpha is put in words", () => {
  const b = block();
  b.behaviour!.flags = ["low_hit_rate", "something_new"];
  render(<TaskPanel block={b} />);
  expect(screen.getByText(/may only mean pressing less/)).toBeTruthy();
  expect(screen.getByText("something_new")).toBeTruthy();
  expect(
    screen.getByText(
      /went with slower responses \(ρ = 0\.31, 190 trials, p = <0\.001\)/
    )
  ).toBeTruthy();
});

test("a block without behaviour renders nothing; one without EEG still shows the task", () => {
  const { container } = render(
    <TaskPanel block={block({ behaviour: null })} />
  );
  expect(container.innerHTML).toBe("");
  cleanup();
  render(<TaskPanel block={block({ erp: null, prestimulus: null })} />);
  expect(screen.getByText("97%")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
