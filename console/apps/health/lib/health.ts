/**
 * Health's payloads as the backend's panels write them (`console/apps/health/` in the
 * backend), and the pure rules the page draws them with.
 */

export interface QueueJob {
  id: string;
  kind: string;
  target: string | null;
  attempts: number;
}

export interface StaleJob extends QueueJob {
  locked_at: string | null;
  locked_for_s: number | null;
}

export interface LoopJob extends QueueJob {
  status: string;
  error: string | null;
  created_at: string | null;
}

export interface FailedJob extends QueueJob {
  error: string | null;
  finished_at: string | null;
}

export interface JobsPayload {
  stale_minutes: number;
  max_attempts: number;
  /** By kind, then by status. */
  queue: Record<string, Record<string, number>>;
  queued: number;
  oldest_queued_s: number | null;
  stale: StaleJob[];
  retry_loops: LoopJob[];
  failed_24h: number;
  failures: FailedJob[];
}

export interface Termination {
  reason: string | null;
  exit_code: number | null;
  finished_at: string | null;
  ago_s: number | null;
}

export interface Container {
  name: string;
  ready: boolean;
  restarts: number;
  state: "running" | "waiting" | "terminated" | "unknown";
  reason: string | null;
  last: Termination | null;
  memory_used_mib: number | null;
  memory_request_mib: number | null;
  memory_limit_mib: number | null;
}

export interface Pod {
  name: string;
  app: string | null;
  phase: string | null;
  ready: boolean;
  started_at: string | null;
  age_s: number | null;
  containers: Container[];
}

export interface ClusterEvent {
  type: string | null;
  reason: string | null;
  object: string;
  message: string;
  count: number;
  last_seen: string | null;
  ago_s: number | null;
}

export interface PodsPayload {
  namespace: string;
  metrics: boolean;
  pods: Pod[];
  restarts_total: number;
  restarted_24h: number;
  oom_24h: number;
  events: ClusterEvent[];
}

/** The statuses in the order a queue reads: waiting, working, finished. */
export const STATUSES = ["queued", "running", "done", "failed"] as const;

/** Of memory use against the limit: past 90% is where the OOM killer acts. */
export type MemoryLevel = "ok" | "high" | "critical" | "unknown";

/** How full a container's memory is, against its limit (or its request without one). */
export function memoryLevel(c: Container): {
  share: number | null;
  level: MemoryLevel;
} {
  const ceiling = c.memory_limit_mib ?? c.memory_request_mib;
  if (c.memory_used_mib === null || !ceiling)
    return { share: null, level: "unknown" };
  const share = c.memory_used_mib / ceiling;
  const level = share >= 0.9 ? "critical" : share >= 0.75 ? "high" : "ok";
  return { share, level };
}

/** A pod that needs a look: not ready, or a container that restarted or stopped. */
export function podTrouble(pod: Pod): boolean {
  if (pod.phase === "Succeeded") return false;
  return (
    !pod.ready ||
    pod.containers.some(
      (c) =>
        c.state !== "running" ||
        c.last?.reason === "OOMKilled" ||
        (c.last?.ago_s ?? Infinity) < 86_400
    )
  );
}

/** Pods that need a look first, then the rest, each group in the backend's order. */
export function sortPods(pods: Pod[]): Pod[] {
  return [...pods.filter(podTrouble), ...pods.filter((p) => !podTrouble(p))];
}

/** A uuid as the page shows it: its first block, enough to tell rows apart. */
export function shortId(id: string | null): string {
  return id ? id.split("-")[0] : "–";
}

/** MiB as people read it: `940 MiB`, `2.4 GiB`. */
export function mib(n: number | null): string {
  if (n === null) return "–";
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GiB`;
  return `${Math.round(n)} MiB`;
}

/**
 * An age measured at refresh time, as of now: `ago_s` plus how old the snapshot is.
 * Null stays null (nothing was measured).
 */
export function since(
  agoSeconds: number | null,
  snapshotAge: number
): number | null {
  return agoSeconds === null ? null : agoSeconds + snapshotAge;
}

/** The containers whose log a person can open, and whether a previous run exists. */
export function logTargets(
  pods: Pod[]
): { pod: string; container: string; previous: boolean }[] {
  return pods.flatMap((p) =>
    p.containers.map((c) => ({
      pod: p.name,
      container: c.name,
      previous: c.restarts > 0 || c.last !== null,
    }))
  );
}
