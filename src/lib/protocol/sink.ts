/**
 * Where markers go.
 *
 * The backend appends each posted batch as a *new numbered part* and merges the parts on
 * finish, so a retry of a batch that actually succeeded would duplicate every event in it
 * - the merge has no dedup. The sink therefore never retries a batch whose fate is
 * unknown in parallel: batches are posted strictly one at a time, and a failed batch stays
 * at the head of the buffer until a later attempt is acknowledged.
 *
 * Batch limits mirror the endpoint's: 500 events per batch and 4096 bytes per event.
 */

import {
  MAX_EVENTS_PER_BATCH,
  MAX_PAYLOAD_BYTES,
  type Marker,
  toWireEvent,
  wireEventBytes,
} from "./marker";

export interface MarkerSink {
  push(marker: Marker): void;
  /** Post everything buffered. Safe to call repeatedly; serializes internally. */
  flush(): Promise<void>;
  /** Last-gasp send on pagehide; fire and forget. */
  flushBeacon(): void;
  /** Every marker this run produced, in order. */
  all(): readonly Marker[];
  readonly pending: number;
}

/** Collects markers without sending them; used by tests and by runs with no session. */
export function createMemorySink(): MarkerSink {
  const markers: Marker[] = [];
  return {
    push: (m) => void markers.push(m),
    flush: async () => {},
    flushBeacon: () => {},
    all: () => markers,
    get pending() {
      return 0;
    },
  };
}

export interface SessionSinkOptions {
  batchMax?: number;
  /** Post automatically once this many markers are buffered. */
  highWater?: number;
  post?: (path: string, body: unknown) => Promise<unknown>;
  beacon?: (path: string, body: unknown) => boolean;
}

/**
 * Oversized payloads are dropped down to their identifying fields rather than failing the
 * batch: losing one marker's detail is recoverable, losing the batch is not.
 */
function toSafeWireEvent(marker: Marker) {
  const event = toWireEvent(marker);
  if (wireEventBytes(event) <= MAX_PAYLOAD_BYTES) return event;
  return {
    ...event,
    payload: {
      kind: marker.kind,
      t_monotonic_ms: marker.tMonotonicMs,
      t_run_ms: marker.tRunMs,
      t_session_estimated: marker.tSessionS === null,
      step_id: marker.meta.step_id,
      phase: marker.meta.phase,
      trial_id: marker.meta.trial_id,
      payload_truncated: true,
    },
  };
}

export function createSessionSink(
  sessionId: string,
  options: SessionSinkOptions = {}
): MarkerSink {
  const batchMax = Math.min(options.batchMax ?? 200, MAX_EVENTS_PER_BATCH);
  const highWater = options.highWater ?? batchMax;
  const path = `sessions/${sessionId}/events`;

  const all: Marker[] = [];
  let buffer: Marker[] = [];
  let inFlight: Promise<void> = Promise.resolve();

  const post =
    options.post ??
    (async (p: string, body: unknown) => {
      const { api } = await import("@/lib/api");
      return api.post(p, body);
    });

  const beacon =
    options.beacon ??
    ((p: string, body: unknown) => {
      if (typeof navigator === "undefined" || !navigator.sendBeacon)
        return false;
      const blob = new Blob([JSON.stringify(body)], {
        type: "application/json",
      });
      return navigator.sendBeacon(`/api/backend/${p}`, blob);
    });

  async function sendOnce(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer.slice(0, batchMax);
    const body = { events: batch.map(toSafeWireEvent) };
    await post(path, body);
    // Only drop the batch once the server has acknowledged it; a failed post leaves the
    // buffer untouched so the next attempt resends the same events, never a second part.
    buffer = buffer.slice(batch.length);
  }

  async function drain(): Promise<void> {
    while (buffer.length > 0) await sendOnce();
  }

  return {
    push(marker) {
      all.push(marker);
      buffer.push(marker);
      if (buffer.length >= highWater) {
        void this.flush();
      }
    },
    flush() {
      inFlight = inFlight.then(drain, drain);
      return inFlight;
    },
    flushBeacon() {
      if (buffer.length === 0) return;
      const batch = buffer.slice(0, batchMax);
      if (beacon(path, { events: batch.map(toSafeWireEvent) })) {
        buffer = buffer.slice(batch.length);
      }
    },
    all: () => all,
    get pending() {
      return buffer.length;
    },
  };
}
