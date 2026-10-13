/**
 * A failed headband connection as data, and the sentence the person reads for it.
 *
 * The drivers and the browser fail in English, with messages meant for logs. What the
 * screen shows is derived from a stable code instead (`device.errors.*` in
 * `messages/*.json`), so the same failure reads right in every language. Two things are
 * shown as they come because they are not this app's words: the browser's own detail
 * inside a Bluetooth failure, and the message of an error no rule here recognises.
 */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import {
  type ConnectRefusal,
  type ConnectStep,
  MuseConnectError,
} from "./device";

export type MuseFailure =
  /** The chooser was closed without picking a headband. */
  | { code: "noneSelected" }
  /** Pairing stopped at a known step of `BluetoothMuse.connect()`. */
  | {
      code: "bluetoothFailed";
      step: ConnectStep;
      /** What was being subscribed to (`EEG TP9`, `gyro`), when `step` is `subscribe`. */
      stream: string | null;
      /** The browser's own words; shown as given. */
      detail: string;
      refusal: ConnectRefusal | null;
    }
  /** Something else that carried a message of its own; shown as given. */
  | { code: "other"; message: string }
  /** Something else with nothing readable to show but its string form. */
  | { code: "connectFailed"; detail: string };

/**
 * Classify whatever `MuseDevice.connect()` rejected with.
 *
 * Duck-typed on `name` and `message`: not every browser rejects with an `Error`, and a
 * `DOMException` is not one everywhere.
 */
export function failureOf(err: unknown): MuseFailure {
  const { name, message } = (err ?? {}) as {
    name?: unknown;
    message?: unknown;
  };
  if (name === "NotFoundError") return { code: "noneSelected" };
  if (err instanceof MuseConnectError)
    return {
      code: "bluetoothFailed",
      step: err.step,
      stream: err.stream,
      detail: err.detail,
      refusal: err.refusal,
    };
  if (typeof message === "string" && message) return { code: "other", message };
  return { code: "connectFailed", detail: String(err) };
}

type DeviceT = ReturnType<typeof useTranslations<"device">>;

/** The pure rule, separate from the hook so it can be tested without React. */
export function describeFailure(t: DeviceT, failure: MuseFailure): string {
  switch (failure.code) {
    case "noneSelected":
      return t("errors.noneSelected");
    case "bluetoothFailed":
      return t(`errors.failedAt.${failure.step}`, {
        stream: failure.stream ?? "",
        detail: failure.refusal
          ? t(`errors.refusals.${failure.refusal}`)
          : failure.detail,
      });
    case "other":
      return failure.message;
    case "connectFailed":
      return t("errors.connectFailed", { detail: failure.detail });
  }
}

/** `const describe = useMuseFailureMessage(); describe(muse.failure)` in a component. */
export function useMuseFailureMessage(): (failure: MuseFailure) => string {
  const t = useTranslations("device");
  return useCallback(
    (failure: MuseFailure) => describeFailure(t, failure),
    [t]
  );
}
