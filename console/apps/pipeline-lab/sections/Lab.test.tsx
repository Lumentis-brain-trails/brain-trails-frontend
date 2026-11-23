import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn, IntlIt } from "@console/i18n/testing";
import type { LabOptions, LabResult, LabRun } from "@console/lib/client";
import { defaultForm } from "../lib/lab";
import { ExperimentForm } from "./ExperimentForm";
import { RunView } from "./RunView";

const get = vi.fn();
const post = vi.fn();
vi.mock("@console/lib/client", async (orig) => {
  const real = await orig<typeof import("@console/lib/client")>();
  const client = {
    get: (path: string) => get(path),
    post: (path: string, body?: unknown) => post(path, body),
    put: vi.fn(),
    delete: vi.fn(),
    page: vi.fn(),
  };
  return { ...real, ops: client, opsIn: () => client };
});

const RUN_ID = "0b6c1f0e-8a52-4bb2-9d0b-3c4c8f9f1a11";

const opt = (value: string, recordings = 4) => ({
  value,
  label: value,
  recordings,
});

const OPTIONS: LabOptions = {
  env: "dev",
  available: true,
  reason: null,
  recordings: 42,
  people: 7,
  research_recordings: 30,
  date_first: "2026-10-01T00:00:00Z",
  date_last: "2026-11-20T00:00:00Z",
  protocols: [opt("8a7d4e2c-0000-4000-8000-000000000001")],
  block_kinds: [opt("rest"), opt("task")],
  block_labels: [opt("Eyes closed")],
  trial_labels: [opt("go"), opt("nogo")],
  task_labels: [],
  context_items: [],
  devices: [opt("Muse 2")],
  sexes: [opt("female"), opt("male")],
  age_bands: [opt("25-34")],
  qualities: [opt("good")],
  reductions: ["pca", "tsne"],
  unavailable_reductions: ["umap"],
  caps: {
    max_recordings: 200,
    max_windows: 50000,
    max_windows_per_person: 4000,
    max_nodes: 300,
    points: 5000,
    time_limit_s: 600,
  },
};

const score = (mean: number, sd: number) => ({
  auc_mean: mean,
  auc_sd: sd,
  folds: [mean - 0.05, mean, mean + 0.05],
  transductive: false,
});

const RESULT: LabResult = {
  summary: {
    n_recordings: 12,
    n_people: 6,
    n_windows: 900,
    embedder: "reve-base",
    dim: 512,
    reduced_dim: 18,
    date_first: "2026-10-01T00:00:00Z",
    date_last: "2026-11-20T00:00:00Z",
    data_fingerprint: "3f9a0c1e2b4d5a6c",
    skipped: { other_embedder: 1, window_cap: 0 },
    labels: [
      { label: "rest", windows: 500, people: 6 },
      { label: "task", windows: 400, people: 5 },
    ],
  },
  graph: {
    epsilon: 0.8,
    auto: true,
    n_nodes: 2,
    n_edges: 1,
    n_components: 1,
    betti1: 0,
    betti1_per_node: 0,
    degree_entropy_normalized: null,
    stress: 0.1,
    nodes: [
      { x: 0, y: 0, mass: 10, labels: { rest: 8, task: 2 } },
      { x: 1, y: 1, mass: 5, labels: { task: 5 } },
    ],
    edges: [[0, 1]],
  },
  metrics: ["entropy", "modularity"],
  table: [
    {
      person: "aa11bb22cc33dd44",
      label: null,
      n_windows: 150,
      n_regions: 4,
      entropy: 0.5123,
      modularity: 0.31,
    },
    {
      person: "aa11bb22cc33dd44",
      label: "rest",
      n_windows: 80,
      n_regions: 3,
      entropy: 0.42,
      modularity: null,
    },
  ],
  by_label: [
    {
      label: null,
      people: 6,
      windows: 900,
      metrics: {
        entropy: { mean: 0.5, sd: 0.1, people: 6 },
        modularity: { mean: 0.3, sd: null, people: 1 },
      },
    },
  ],
  classifier: {
    status: "done",
    n_people: 6,
    n_people_a: 6,
    n_people_b: 5,
    n_windows: 900,
    n_splits: 3,
    embeddings: score(0.734, 0.051),
    reduction: score(0.61, 0.08),
    warnings: ["few_people"],
  },
  points: {
    method: "pca",
    n_total: 900,
    x: [0, 1, 2],
    y: [2, 1, 0],
    label: [0, 1, -1],
    person: [0, 0, 1],
    labels: ["rest", "task"],
    people: ["aa11bb22cc33dd44", "ee55ff66aa77bb88"],
  },
  timing: { load: 1.2, reduce: 0.3 },
};

function run(extra: Partial<LabRun> = {}): LabRun {
  return {
    id: RUN_ID,
    env: "dev",
    title: "Rest vs task",
    status: "done",
    config: {
      title: "Rest vs task",
      question: {
        kind: "ab",
        label: "block_kind",
        context_item: null,
        a: "rest",
        b: "task",
      },
      preprocessing: "standard",
      artefacts: "standard",
      encoding: "standard",
    },
    config_hash: "c0ffee00c0ffee00c0ffee00",
    rerun_of: null,
    created_by: "core@example.com",
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error: null,
    result: RESULT,
    ...extra,
  };
}

function renderIn(node: React.ReactNode, Intl: typeof IntlEn = IntlEn) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <Intl>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </Intl>
  );
}

const view = () => (
  <RunView runId={RUN_ID} onBack={vi.fn()} onOpen={vi.fn()} onCopy={vi.fn()} />
);

beforeEach(() => {
  get.mockImplementation((path: string) =>
    Promise.resolve(path === "lab/options" ? OPTIONS : run())
  );
  post.mockResolvedValue(run({ status: "queued", result: null }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("a done A/B run shows its AUC, its people and the few-people note", async () => {
  renderIn(view());
  expect(await screen.findByText("A against B: rest / task")).toBeTruthy();
  expect(
    screen.getByText("6 people (6 with A, 5 with B), 900 windows.")
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Fewer than 10 people: read this score as a hint, not a result."
    )
  ).toBeTruthy();
  expect(screen.getByText("0.73")).toBeTruthy();
  expect(screen.getByText("± 0.05")).toBeTruthy();
  expect(screen.getByText("0.61")).toBeTruthy();
  expect(screen.getByText("another embedder: 1")).toBeTruthy();
  expect(
    screen.getByRole("img", {
      name: "Windows on the 2-D map, coloured by label",
    })
  ).toBeTruthy();
  // the pseudonymised key, shortened; never more
  expect(screen.getAllByText("aa11bb22")).toHaveLength(2);
  expect(screen.getByText("0.512")).toBeTruthy();
  expect(screen.getByText("0.500 ± 0.100")).toBeTruthy();
  expect(screen.getByText("Took 1.5 s.")).toBeTruthy();
});

test("the same result in Italian", async () => {
  renderIn(view(), IntlIt);
  expect(await screen.findByText("A contro B: rest / task")).toBeTruthy();
  expect(
    screen.getByText(
      "Meno di 10 persone: leggi questo punteggio come un indizio, non come un risultato."
    )
  ).toBeTruthy();
  expect(screen.getByText("Per persona")).toBeTruthy();
});

test("a running run is read every 3 s and no more once it is done", async () => {
  // Only the interval react-query polls with; waitFor keeps its real timeouts.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const runs = [
    run({ status: "running", result: null }),
    run({ status: "done" }),
  ];
  get.mockImplementation(() => Promise.resolve(runs.shift() ?? run()));
  renderIn(view());
  expect(
    await screen.findByText(
      "Running. This page reads the run again every 3 seconds."
    )
  ).toBeTruthy();
  expect(get).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3100);
  });
  expect(await screen.findByText("0.73")).toBeTruthy();
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(get).toHaveBeenCalledTimes(2);
});

test("a failed run says what stopped it", async () => {
  get.mockResolvedValue(
    run({
      status: "failed",
      result: null,
      error: "eps_too_small: the radius makes 4000 balls",
    })
  );
  renderIn(view());
  expect(
    await screen.findByText(
      "This radius makes too many balls. Choose a larger one, or leave it empty."
    )
  ).toBeTruthy();
  expect(screen.getByText("Detail: the radius makes 4000 balls")).toBeTruthy();
});

test("the form lays out the pipeline, marks phase 2 standard, and has no UMAP", async () => {
  renderIn(<ExperimentForm initial={defaultForm()} onStarted={vi.fn()} />);
  expect(await screen.findByText("Question")).toBeTruthy();
  for (const step of [
    "Data",
    "Preprocessing",
    "Artefact removal",
    "Encoding",
    "Dimensionality reduction",
    "Graph (Ball Mapper)",
    "NeuroMetrics",
  ])
    expect(screen.getByText(step)).toBeTruthy();
  expect(screen.getAllByText("Standard")).toHaveLength(3);
  expect(screen.getByLabelText("UMAP")).toBeDisabled();
  expect(
    screen.getByText(
      "UMAP is not available: it is not a dependency of the service."
    )
  ).toBeTruthy();
  expect(screen.getByLabelText(/Only people who agreed/)).toBeChecked();
});

test("the form refuses an incomplete A/B and sends a complete one", async () => {
  const onStarted = vi.fn();
  renderIn(<ExperimentForm initial={defaultForm()} onStarted={onStarted} />);
  await screen.findByText("Question");
  fireEvent.click(screen.getByRole("radio", { name: "A against B" }));
  fireEvent.click(screen.getByRole("button", { name: "Run the experiment" }));
  expect(screen.getByText("Give the experiment a title.")).toBeTruthy();
  expect(
    screen.getByText("An A/B question needs a label source.")
  ).toBeTruthy();
  expect(post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "Go vs no-go" },
  });
  fireEvent.change(screen.getByLabelText(/^Label windows by/), {
    target: { value: "trial" },
  });
  fireEvent.change(screen.getByLabelText("A"), { target: { value: "go" } });
  fireEvent.change(screen.getByLabelText(/^B/), { target: { value: "nogo" } });
  fireEvent.click(screen.getByRole("button", { name: "Run the experiment" }));
  await waitFor(() => expect(onStarted).toHaveBeenCalled());
  const [path, body] = post.mock.calls[0];
  expect(path).toBe("lab/runs");
  expect(body).toMatchObject({
    title: "Go vs no-go",
    question: { kind: "ab", label: "trial", a: "go", b: "nogo" },
    preprocessing: "standard",
    filters: { research_consent_only: true, max_recordings: 50 },
  });
});

test("an environment the lab cannot read says so instead of the form", async () => {
  get.mockResolvedValue({
    ...OPTIONS,
    available: false,
    reason: "no LAB_S3_* for dev",
  });
  renderIn(<ExperimentForm initial={defaultForm()} onStarted={vi.fn()} />);
  expect(await screen.findByText("The lab cannot run on Dev")).toBeTruthy();
  expect(screen.getByText("no LAB_S3_* for dev")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run the experiment" })).toBe(
    null
  );
});
