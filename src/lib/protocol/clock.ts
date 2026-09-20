/**
 * Clock anchors: turning a browser timestamp into the EEG session clock.
 *
 * Decision V1-0001 makes the device sample counter the clock and anchors it to the
 * browser by robust regression: `t_session = a + b * t_dev`. Until a headband is
 * streaming there is no fit, so `runAnchor` carries a run-relative axis and reports
 * `null` for session seconds; every marker it stamps is flagged estimated.
 *
 * `eegAnchor` is the real one. It is written and tested now even though nothing wires
 * it yet, so connecting the headband later is a one-line change on the run page rather
 * than a redesign.
 */

export type AnchorKind = "run" | "eeg";

export interface ClockAnchor {
  readonly kind: AnchorKind;
  /** Milliseconds since the protocol started. */
  toRunMs(hostMs: number): number;
  /** Seconds on the EEG session clock, or null when no fit exists. */
  toSessionS(hostMs: number): number | null;
}

/** No EEG: the run clock is the only axis. */
export function runAnchor(t0HostMs: number): ClockAnchor {
  return {
    kind: "run",
    toRunMs: (hostMs) => hostMs - t0HostMs,
    toSessionS: () => null,
  };
}

/**
 * The inputs an EEG anchor needs, matching what a packet timeline already computes.
 *
 * `hostMsAtIndex0` is the host time the fit puts sample 0 at, and `msPerSample` is the
 * fitted device period - both move as anchors accumulate, which is why this is read
 * through a getter rather than captured once.
 */
export interface TimelineFit {
  hostMsAtIndex0: number;
  msPerSample: number;
}

/**
 * Anchor host time to EEG session seconds.
 *
 * `firstSampleIndex` is the first sample the recording actually kept, so session time
 * starts at 0 there rather than at the device's own counter origin. `readFit` is called
 * per marker so a live re-fit is picked up; it returns null before the first fit exists.
 */
export function eegAnchor(
  t0HostMs: number,
  readFit: () => TimelineFit | null,
  firstSampleIndex: number,
  sfreq = 256
): ClockAnchor {
  return {
    kind: "eeg",
    toRunMs: (hostMs) => hostMs - t0HostMs,
    toSessionS: (hostMs) => {
      const fit = readFit();
      if (fit === null || fit.msPerSample <= 0) return null;
      const sampleIndex = (hostMs - fit.hostMsAtIndex0) / fit.msPerSample;
      return (sampleIndex - firstSampleIndex) / sfreq;
    },
  };
}
