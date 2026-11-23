import { describe, expect, test } from "vitest";
import type { LabOptions } from "@console/lib/client";
import {
  GREY,
  METRICS,
  PALETTE,
  POLL_MS,
  auc,
  colourFor,
  colourOf,
  defaultForm,
  dominant,
  fewPeople,
  fit,
  fromExperiment,
  isActive,
  labelValues,
  metric,
  pollInterval,
  problems,
  runError,
  runErrorCode,
  scatter,
  toExperiment,
} from "./lab";

const opt = (value: string) => ({ value, label: value, recordings: 3 });

const OPTIONS = {
  block_kinds: [opt("rest"), opt("task")],
  block_labels: [opt("Eyes closed")],
  trial_labels: [opt("go"), opt("nogo")],
  task_labels: [opt("focus")],
  context_items: [{ key: "sleep", values: [opt("good"), opt("poor")] }],
} as unknown as LabOptions;

describe("the form", () => {
  test("a new form is an exploration on research data, every metric on", () => {
    const form = defaultForm();
    expect(form.kind).toBe("explore");
    expect(form.researchOnly).toBe(true);
    expect(form.metrics).toEqual([...METRICS]);
    expect(problems(form)).toEqual(["title"]);
  });

  test("an A/B question needs a source and two different values", () => {
    const form = {
      ...defaultForm(),
      title: "Go vs no-go",
      kind: "ab" as const,
    };
    expect(problems(form)).toEqual(["label", "values"]);
    expect(problems({ ...form, label: "trial", a: "go", b: "go" })).toEqual([
      "sameValues",
    ]);
    expect(
      problems({ ...form, label: "context", a: "good", b: "poor" })
    ).toEqual(["contextItem"]);
    expect(problems({ ...form, label: "trial", a: "go", b: "nogo" })).toEqual(
      []
    );
  });

  test("dates, radius, perplexity, caps and metrics are checked", () => {
    const form = {
      ...defaultForm(),
      title: "x",
      dateFrom: "2026-11-02",
      dateTo: "2026-11-01",
      eps: "-1",
      method: "tsne" as const,
      perplexity: 2,
      maxRecordings: 500,
      metrics: [],
    };
    expect(problems(form)).toEqual([
      "dates",
      "eps",
      "perplexity",
      "maxRecordings",
      "metrics",
    ]);
    expect(problems({ ...form, eps: "abc" })).toContain("eps");
    expect(
      problems({ ...defaultForm(), title: "x", maxRecordings: 20 }, 10)
    ).toEqual(["maxRecordings"]);
  });

  test("the request leaves empty filters null and marks phase 2 standard", () => {
    const out = toExperiment({
      ...defaultForm(),
      title: "  Rest vs task ",
      kind: "ab",
      label: "block_kind",
      a: "rest",
      b: "task",
      ageBand: "25-34",
      minQuality: "good",
      eps: "0.5",
      metrics: ["modularity", "entropy"],
    });
    expect(out.title).toBe("Rest vs task");
    expect(out.question).toEqual({
      kind: "ab",
      label: "block_kind",
      context_item: null,
      a: "rest",
      b: "task",
    });
    expect(out.filters?.protocol_id).toBeNull();
    expect(out.filters?.age_band).toBe("25-34");
    expect(out.filters?.min_quality).toBe("good");
    expect(out.filters?.research_consent_only).toBe(true);
    expect([out.preprocessing, out.artefacts, out.encoding]).toEqual([
      "standard",
      "standard",
      "standard",
    ]);
    expect(out.graph).toEqual({ eps: 0.5 });
    // in the backend's order, whatever order they were ticked in
    expect(out.metrics).toEqual(["entropy", "modularity"]);
  });

  test("an exploration sends no A or B, and the context item only for context", () => {
    const out = toExperiment({
      ...defaultForm(),
      title: "x",
      label: "trial",
      contextItem: "sleep",
      a: "go",
      b: "nogo",
    });
    expect(out.question).toMatchObject({
      kind: "explore",
      context_item: null,
      a: null,
      b: null,
    });
    expect(out.graph).toEqual({ eps: null });
  });

  test("a stored experiment comes back to the same form", () => {
    const form = {
      ...defaultForm(),
      title: "Sleep",
      kind: "ab" as const,
      label: "context" as const,
      contextItem: "sleep",
      a: "good",
      b: "poor",
      device: "Muse 2",
      dateFrom: "2026-10-01",
      method: "tsne" as const,
      perplexity: 40,
      eps: "1.25",
      metrics: ["entropy" as const],
    };
    expect(fromExperiment(toExperiment(form))).toEqual(form);
    const bare = fromExperiment({
      title: "t",
      preprocessing: "standard",
      artefacts: "standard",
      encoding: "standard",
    });
    expect(bare).toEqual({ ...defaultForm(), title: "t" });
  });
});

describe("label values", () => {
  test("each source offers its own values", () => {
    expect(labelValues(OPTIONS, "block_kind", "").map((o) => o.value)).toEqual([
      "rest",
      "task",
    ]);
    expect(labelValues(OPTIONS, "block_label", "")).toHaveLength(1);
    expect(labelValues(OPTIONS, "trial", "")).toHaveLength(2);
    expect(labelValues(OPTIONS, "task_label", "")).toHaveLength(1);
    expect(labelValues(OPTIONS, "context", "sleep")).toHaveLength(2);
    expect(labelValues(OPTIONS, "context", "nothing")).toEqual([]);
    expect(labelValues(OPTIONS, "", "")).toEqual([]);
  });
});

describe("runs", () => {
  test("an unfinished run is read every 3 s, a finished one never", () => {
    expect(POLL_MS).toBe(3000);
    expect(pollInterval("queued")).toBe(3000);
    expect(pollInterval("running")).toBe(3000);
    expect(pollInterval("done")).toBe(false);
    expect(pollInterval("failed")).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
    // a failed read stops the polling, unfinished or not
    expect(pollInterval("running", true)).toBe(false);
    expect(pollInterval("queued", false)).toBe(3000);
    expect(isActive("running")).toBe(true);
  });

  test("a stored error splits into its code and message", () => {
    expect(runError(null)).toBeNull();
    expect(runError("time_limit: stopped at graph")).toEqual({
      code: "time_limit",
      message: "stopped at graph",
    });
    expect(runError("failed: ValueError")).toEqual({
      code: "failed",
      message: "ValueError",
    });
    expect(runError("Something odd")).toEqual({
      code: "failed",
      message: "Something odd",
    });
    expect(runErrorCode("eps_too_small")).toBe("eps_too_small");
    expect(runErrorCode("whatever")).toBe("failed");
  });
});

describe("drawing", () => {
  test("labels take the palette in order; other and unlabelled are grey", () => {
    const labels = ["go", "nogo", "other"];
    expect(colourOf(labels, 0)).toBe(PALETTE[0]);
    expect(colourOf(labels, 1)).toBe(PALETTE[1]);
    expect(colourOf(labels, 2)).toBe(GREY);
    expect(colourOf(labels, -1)).toBe(GREY);
    expect(colourOf(labels, 9)).toBe(GREY);
    expect(colourFor(labels, "nogo")).toBe(PALETTE[1]);
    expect(colourFor(labels, "missing")).toBe(GREY);
  });

  test("fit maps onto the box and centres a flat axis", () => {
    const f = fit([0, 5, 10], 100, 10);
    expect(f(0)).toBe(10);
    expect(f(10)).toBe(90);
    expect(f(5)).toBe(50);
    expect(fit([3, 3], 100, 10)(3)).toBe(50);
    expect(fit([], 100, 10)(1)).toBe(50);
  });

  test("the scatter puts y up and draws unlabelled points first", () => {
    const drawn = scatter(
      {
        method: "pca",
        n_total: 3,
        x: [0, 1, 2],
        y: [0, 1, 2],
        label: [0, -1, 1],
        person: [0, 0, 1],
        labels: ["a", "b"],
        people: ["p1", "p2"],
      },
      116,
      116
    );
    expect(drawn.map((p) => p.labelled)).toEqual([false, true, true]);
    expect(drawn[0].colour).toBe(GREY);
    // the lowest y sits at the bottom of the box
    const first = drawn.find((p) => p.x === 8)!;
    expect(first.y).toBe(108);
  });

  test("a node takes its most frequent label's colour", () => {
    expect(dominant({ go: 3, nogo: 5 }, ["go", "nogo"])).toBe(PALETTE[1]);
    expect(dominant({}, ["go"])).toBe(GREY);
  });

  test("numbers read short, with a dash for none", () => {
    expect(auc(0.734)).toBe("0.73");
    expect(auc(null)).toBe("–");
    expect(metric(0.123456)).toBe("0.123");
    expect(metric(1234.5)).toBe("1235");
    expect(metric(null)).toBe("–");
    expect(metric(Number.NaN)).toBe("–");
  });

  test("a score from fewer than ten people says so", () => {
    expect(fewPeople(null)).toBe(false);
    const base = {
      status: "done" as const,
      n_people: 12,
      n_people_a: 6,
      n_people_b: 6,
      n_splits: 5,
      n_windows: 100,
    };
    expect(fewPeople(base)).toBe(false);
    expect(fewPeople({ ...base, warnings: ["few_people"] })).toBe(true);
    expect(fewPeople({ ...base, n_people: 4 })).toBe(true);
  });
});
