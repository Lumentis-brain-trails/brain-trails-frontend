import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import type { BlockMetrics } from "@/lib/compare/rows";
import { ROWS_STORAGE_KEY } from "@/lib/compare/rows";
import type { WireEvent } from "@/lib/protocol/marker";
import type { Analysis } from "@/lib/types";
import { CompareView, defaultPair } from "./CompareView";

const analysis: Analysis = {
  id: "a",
  cleaner_name: "classic",
  cleaner_version: "1",
  embedder_name: "reve",
  embedder_version: "1",
  window_s: 4,
  step_s: 1,
  smooth_s: 0,
  projector_name: "ballmapper-landscape",
  projector_meta: {},
  landscape: {
    epsilon: 1,
    n_nodes: 3,
    stress: 0.1,
    sigma: 0.5,
    positions: [
      [0, 0],
      [1, 1],
      [2, 0],
    ],
    masses: [20, 20, 20],
  },
  points: Array.from({ length: 60 }, (_, i) => ({
    idx: i,
    t_start: i,
    t_end: i + 4,
    pc1: Math.cos(i / 10),
    pc2: Math.sin(i / 7),
  })),
};

const dynamics = {
  n_windows: 30,
  n_regions: 3,
  entropy: 1.2,
  recurrence: 0.5,
  modularity: null,
  diameter: 3.4,
  stretching: 0.1,
};

const settle = {
  block_id: "settle",
  key: "settle#0",
  label: "Settle",
  kind: "baseline",
  condition: null,
  node_path: null,
  iteration: null,
  t_start_s: 0,
  t_end_s: 30,
  n_windows: 30,
  bands: { alpha: 0.4, beta: 0.15, theta: 0.2, delta: 0.2 },
  bands_uv2: {},
  ratios: {},
  asymmetry: null,
  artefact: null,
  good_contact: null,
  baseline_distance: null,
  labels: null,
  dynamics,
} as unknown as BlockMetrics;

const dock = {
  ...settle,
  block_id: "dock",
  key: "dock#0",
  label: "Dock the cargo",
  kind: "go-no-go",
  t_start_s: 30,
  t_end_s: 60,
  bands: { alpha: 0.25, beta: 0.3, theta: 0.2, delta: 0.2 },
  labels: Array.from({ length: 30 }, (_, i) =>
    i % 3 === 0 ? "debris_held" : i % 5 === 0 ? null : "cargo_pressed"
  ),
  dynamics: { ...dynamics, modularity: 0.12 },
  behaviour: { accuracy: 0.82, rt: { median_ms: 410, mad_ms: 60 } },
  norm: {
    n_people: 12,
    accuracy: 0.78,
    hit_rate: null,
    commission_rate: null,
    median_rt_ms: 450,
    rt_mad_ms: 70,
  },
} as unknown as BlockMetrics;

const events: WireEvent[] = [
  {
    t: 31,
    type: "marker",
    payload: { kind: "stimulus", trial_id: 1, stimulus_class: "cargo" },
  },
  {
    t: 32,
    type: "marker",
    payload: {
      kind: "outcome",
      trial_id: 1,
      outcome: "hit",
      stimulus_class: "cargo",
    },
  },
];

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CompareView
        analysis={analysis}
        blocks={[settle, dock]}
        events={events}
        steps={{ settle: { kind: "baseline", config: { eyes: "closed" } } }}
        bands={null}
        videoAt={() => null}
      />
    </NextIntlClientProvider>
  );
}

function column(name: "Left block" | "Right block") {
  return within(screen.getByRole("region", { name }));
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no canvas; the task frame paints nothing and must not crash
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("defaultPair", () => {
  test("the baseline on the left, the first task on the right", () => {
    expect(defaultPair([dock, settle])).toEqual(["settle#0", "dock#0"]);
  });

  test("without a baseline or a task, the first two blocks", () => {
    const a = { ...settle, key: "a", kind: "video" } as BlockMetrics;
    const b = { ...settle, key: "b", kind: "video" } as BlockMetrics;
    expect(defaultPair([a, b])).toEqual(["a", "b"]);
  });
});

describe("CompareView", () => {
  test("opens on the baseline and the task, with the default rows", () => {
    renderView();
    expect(
      column("Left block").getByRole("combobox", { name: "Left block" })
    ).toHaveValue("settle#0");
    expect(
      column("Right block").getByRole("combobox", { name: "Right block" })
    ).toHaveValue("dock#0");
    for (const side of ["Left block", "Right block"] as const) {
      expect(
        column(side).getByRole("heading", { name: "Alpha" })
      ).toBeInTheDocument();
      expect(
        column(side).getByRole("heading", { name: "Entropy" })
      ).toBeInTheDocument();
      expect(
        column(side).getByRole("heading", { name: "Right actions" })
      ).toBeInTheDocument();
    }
  });

  test("a task block names its trial labels in the task's own words", () => {
    renderView();
    const right = column("Right block");
    expect(right.getByText("Cargo hit")).toBeInTheDocument();
    expect(right.getByText("Debris skipped")).toBeInTheDocument();
    expect(
      column("Left block").getByText(/from the start of the block/)
    ).toBeInTheDocument();
  });

  test("task scores sit next to the average person, and a baseline says it is not a task", () => {
    renderView();
    expect(column("Right block").getByText("82%")).toBeInTheDocument();
    expect(
      column("Right block").getByText("Average person: 78% (12 people)")
    ).toBeInTheDocument();
    expect(column("Left block").getByText("Not a task")).toBeInTheDocument();
  });

  test("the higher block on a row is blue, the lower yellow, equal ones neither", () => {
    renderView();
    const cell = (side: "Left block" | "Right block", row: string) =>
      column(side)
        .getByRole("heading", { name: row })
        .closest("[data-direction]");
    // alpha 40% on the baseline against 25% on the task
    expect(cell("Left block", "Alpha")).toHaveAttribute(
      "data-direction",
      "higher"
    );
    expect(cell("Right block", "Alpha")).toHaveAttribute(
      "data-direction",
      "lower"
    );
    expect(column("Left block").getByText(/higher/)).toBeInTheDocument();
    // both blocks read 1.20 bits: the same to the reader
    expect(cell("Left block", "Entropy")).toHaveAttribute(
      "data-direction",
      "same"
    );
    // a task score against a block that is not a task compares nothing
    expect(cell("Right block", "Right actions")).toHaveAttribute(
      "data-direction",
      "none"
    );
  });

  test("the screen of a baseline is described, not invented", () => {
    renderView();
    expect(column("Left block").getByText("Eyes closed")).toBeInTheDocument();
    expect(column("Right block").getByText("Trial 1 of 1")).toBeInTheDocument();
  });

  test("rows are removed from either column and added back, and remembered", () => {
    renderView();
    fireEvent.click(
      column("Left block").getByRole("button", { name: "Remove Alpha" })
    );
    expect(screen.queryByRole("heading", { name: "Alpha" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Add a row" }), {
      target: { value: "theta" },
    });
    expect(screen.getAllByRole("heading", { name: "Theta" })).toHaveLength(2);
    expect(
      JSON.parse(window.localStorage.getItem(ROWS_STORAGE_KEY) ?? "[]")
    ).toEqual(["entropy", "accuracy", "theta"]);
  });

  test("switching a column's block changes only that column", () => {
    renderView();
    fireEvent.change(
      column("Left block").getByRole("combobox", { name: "Left block" }),
      {
        target: { value: "dock#0" },
      }
    );
    expect(column("Left block").getByText("Cargo hit")).toBeInTheDocument();
    expect(
      column("Right block").getByRole("combobox", { name: "Right block" })
    ).toHaveValue("dock#0");
  });
});
