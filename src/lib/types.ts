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
  explained_variance: {
    ratio?: [number, number] | null;
    cleaner_notes?: string[] | null;
  };
  points: TrailPoint[];
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
