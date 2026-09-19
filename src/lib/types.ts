/** API response types (kept in sync with the backend routers by hand for now). */

export interface RecordingJob {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Recording {
  id: string;
  title: string;
  task_label: string | null;
  source: string;
  status: "uploaded" | "processing" | "done" | "failed";
  duration_s: number | null;
  created_at: string;
  job: RecordingJob | null;
}

export interface TrailPoint {
  idx: number;
  t_start: number;
  t_end: number;
  pc1: number;
  pc2: number;
}

export interface Analysis {
  id: string;
  cleaner_name: string;
  cleaner_version: string;
  embedder_name: string;
  embedder_version: string;
  window_s: number;
  step_s: number;
  smooth_s: number;
  /** Which projector drew the trail: "ballmapper-landscape" or the older "pca". */
  projector_name: string;
  projector_meta: {
    /** PCA only: the share of variance the two axes hold. */
    ratio?: [number, number] | null;
    cleaner_notes?: string[] | null;
  };
  /** Present only for a landscape projection: the terrain the trail is drawn on. */
  landscape: AnalysisLandscape | null;
  points: TrailPoint[];
}

/** The node layout the browser needs to draw a landscape's density field. */
export interface AnalysisLandscape {
  epsilon: number;
  n_nodes: number;
  /** MDS stress-1: how faithfully the layout holds the cover's distances. */
  stress: number | null;
  sigma: number;
  positions: [number, number][];
  masses: number[];
}

/** One ball of a Ball Mapper cover, as the landscape and the graph draw it. */
export interface NeuroNode {
  x: number;
  y: number;
  /** Windows assigned to this ball; the mass of its Gaussian in the density field. */
  mass: number;
  dwell: number;
  flux: number;
  flux_normalized: number;
  betweenness: number;
  bottleneck_score: number;
  /** Relative band powers in `NeuroMetrics.bands` order; empty when uncoloured. */
  bands: number[];
  /** Contiguous `[from, to]` visits in seconds, truncated for long sessions. */
  spans: [number, number][];
  n_visits: number;
}

/** The whole analysis at one ball radius. */
export interface NeuroLevel {
  epsilon: number;
  n_nodes: number;
  n_edges: number;
  n_components: number;
  /**
   * Independent loops in the state graph. This is the cyclomatic number of the
   * Mapper graph, not a homology of the underlying space, and it is not stable in
   * the radius - read `betti1_per_node` and the shape of the curve.
   */
  betti1: number;
  betti1_per_node: number | null;
  degree_entropy: number | null;
  degree_entropy_normalized: number | null;
  /** MDS stress-1 of the layout: the landscape's answer to explained variance. */
  stress: number | null;
  bridges: number;
  /** Kernel width for the density field, in layout units. */
  sigma: number | null;
  tau_mix_s: number | null;
  /** Null when the recording is too short to support an honest interval. */
  tau_mix_ci_s: [number, number] | null;
  lambda2_modulus: number | null;
  spectral_gap: number | null;
  stationary_residual: number | null;
  /** Share of the session inside the sub-chain the mixing numbers describe. */
  coverage: number | null;
  n_states: number;
  bottlenecks: number[];
  nodes: NeuroNode[];
  /** `[i, j, jaccard similarity]` per edge. */
  edges: [number, number, number][];
}

/** A whole radius sweep: every level, plus the curves that summarise them. */
export interface NeuroMetrics {
  analysis_id: string;
  algo_name: string;
  algo_version: string;
  n_points: number;
  dim_reduced: number;
  step_s: number;
  epsilons: number[];
  default_epsilon: number;
  default_index: number;
  bands: string[];
  summary: Record<string, number[] | number>;
  levels: NeuroLevel[];
}

export interface SignalPreview {
  stage: string;
  sfreq: number;
  ch_names: string[];
  t0: number;
  samples: number[][];
}

export interface UserInfo {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  email_verified_at: string | null;
}

export interface Registration {
  user: UserInfo;
  profile: Record<string, string | number | string[] | null>;
}

export interface ApprovalResponse {
  user: UserInfo;
  verification_url: string | null;
}

export const TASK_LABELS = [
  "rest_eyes_open",
  "rest_eyes_closed",
  "meditation",
  "breathing_exercise",
  "mental_arithmetic",
  "reading",
  "music_listening",
  "memory_recall",
  "motor_imagery",
  "video_watching",
] as const;

/**
 * The library's browsing rows, in the order they are shown.
 *
 * Closed list, mirrored from the backend's `MEDIA_TAGS` (which enforces it with a CHECK
 * constraint): tags are the top-level navigation, so a typo would silently produce an
 * empty row rather than an error.
 */
export const MEDIA_TAGS = [
  "attention",
  "anxiety",
  "cognitive_decline",
] as const;

export type MediaTag = (typeof MEDIA_TAGS)[number];

export const MEDIA_TAG_LABELS: Record<MediaTag, string> = {
  attention: "Attention",
  anxiety: "Anxiety",
  cognitive_decline: "Cognitive Decline",
};

/** One line under each row title, saying what the tag is for. */
export const MEDIA_TAG_HINTS: Record<MediaTag, string> = {
  attention:
    "Hold a target, ignore the rest, and stop a response you already started.",
  anxiety: "Settle the body, then watch what the signal does with it.",
  cognitive_decline:
    "Memory, speed and flexibility, measured the same way each time.",
};

/** A catalog item: something a session can be recorded against (backend V2-0002). */
export interface Media {
  id: string;
  kind: "video" | "game" | "scenario";
  visibility: "private" | "official";
  status: "draft" | "ready";
  /** `locked` items are advertised but cannot be started; the backend refuses a session. */
  access: "open" | "locked";
  tags: string[];
  slug: string;
  title: string;
  description: string | null;
  module: string | null;
  manifest: { content_warning?: string | null; expected_duration_s?: number };
  definition: Record<string, unknown>;
  duration_s: number | null;
  created_at: string;
  mine: boolean;
  /** Short-lived links, only on the detail response. */
  url?: string | null;
  cover_url?: string | null;
}
