/**
 * The headband generations Brain Trails records from, and the few facts that
 * differ between them.
 *
 * Two wire protocols are in the field. The Muse 2 and the Muse S (gen 2) push
 * one notification per electrode with 12-bit samples (`protocol.ts`); the Muse
 * S Athena multiplexes every sensor through one characteristic with 14-bit
 * samples (`athena.ts`). Everything above the driver — quality lights, session
 * clock, CSV — is written against this profile instead of against a model
 * name, so the recording is identical whichever band is worn.
 */

/** Which driver and wire format a connected headband speaks. */
export type MuseModel = "muse-2" | "athena" | "simulated";

export interface ModelProfile {
  id: MuseModel;
  /** Shown in the device card and written into the session header. */
  label: string;
  /**
   * Microvolts beyond which a sample sits at an ADC rail. The Muse 2 spans
   * +-1000 uV over 12 bits, the Athena +-725 uV over 14; a fixed threshold
   * would never fire on the Athena.
   */
  eegRailUv: number;
  /**
   * True when the PPG arrives decoded, as the Muse 2's three channels do. The
   * Athena's PPG shares one optics stream with the fNIRS optodes and is not
   * decoded yet: it is kept in the raw capture (V2-0006), not in the extras.
   */
  hasPpg: boolean;
  /** The API's device name, so a recording says which band produced it. */
  apiDevice: "muse-2" | "muse-s-athena";
}

export const MODEL_PROFILES: Record<MuseModel, ModelProfile> = {
  "muse-2": {
    id: "muse-2",
    label: "Muse 2 / Muse S",
    eegRailUv: 990,
    hasPpg: true,
    apiDevice: "muse-2",
  },
  athena: {
    id: "athena",
    label: "Muse S Athena",
    eegRailUv: 715,
    hasPpg: false,
    apiDevice: "muse-s-athena",
  },
  simulated: {
    id: "simulated",
    label: "Simulated headband",
    eegRailUv: 990,
    hasPpg: true,
    apiDevice: "muse-2",
  },
};
