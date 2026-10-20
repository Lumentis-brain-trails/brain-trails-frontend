import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import { BluetoothMuse, MuseConnectError } from "./device";
import { describeFailure, failureOf } from "./failure";

type DeviceT = Parameters<typeof describeFailure>[0];

const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "device",
}) as unknown as DeviceT;
const tIt = createTranslator({
  locale: "it",
  messages: it,
  namespace: "device",
}) as unknown as DeviceT;

describe("failureOf", () => {
  test("a closed chooser is nothing selected, whatever it is an instance of", () => {
    expect(failureOf(new DOMException("cancelled", "NotFoundError"))).toEqual({
      code: "noneSelected",
    });
    expect(failureOf({ name: "NotFoundError" })).toEqual({
      code: "noneSelected",
    });
  });

  test("a driver failure keeps its step, its stream and the browser's detail", () => {
    const err = new MuseConnectError(
      { step: "subscribe", stream: "EEG TP9" },
      "Characteristic is not notifiable",
      "Characteristic is not notifiable"
    );
    expect(failureOf(err)).toEqual({
      code: "bluetoothFailed",
      step: "subscribe",
      stream: "EEG TP9",
      detail: "Characteristic is not notifiable",
      refusal: null,
    });
  });

  test("any other error with a message is shown by that message", () => {
    expect(failureOf(new Error("GATT operation failed"))).toEqual({
      code: "other",
      message: "GATT operation failed",
    });
  });

  test("a rejection with nothing readable keeps its string form", () => {
    expect(failureOf("boom")).toEqual({
      code: "connectFailed",
      detail: "boom",
    });
    expect(failureOf(undefined)).toEqual({
      code: "connectFailed",
      detail: "undefined",
    });
  });
});

describe("describeFailure", () => {
  test("English reads exactly as the driver's own message", () => {
    for (const err of [
      new MuseConnectError(
        { step: "openLink", stream: null },
        "NetworkError: Connection attempt failed.",
        null
      ),
      new MuseConnectError(
        { step: "subscribe", stream: "PPG infrared" },
        "NotSupportedError: GATT operation failed",
        null
      ),
    ])
      expect(describeFailure(tEn, failureOf(err))).toBe(err.message);
  });

  test("the sentence is translated around the browser's detail", () => {
    const failure = failureOf(
      new MuseConnectError(
        { step: "subscribe", stream: "EEG TP9" },
        "NetworkError: gone",
        null
      )
    );
    const text = describeFailure(tIt, failure);
    expect(text).toContain("EEG TP9");
    expect(text).toContain("(NetworkError: gone)");
    expect(text).not.toContain("failed at");
  });

  test("a stop the driver decided on is translated too, and reads the same in English", async () => {
    const bluetooth = {
      requestDevice: async () =>
        Object.assign(new EventTarget(), { name: "Muse-0000", gatt: null }),
    } as unknown as Bluetooth;
    const err = await new BluetoothMuse(bluetooth).connect().catch((e) => e);
    const failure = failureOf(err);
    expect(describeFailure(tEn, failure)).toBe((err as Error).message);
    expect(describeFailure(tIt, failure)).toContain(
      it.device.errors.refusals.noGatt
    );
  });

  test("the simple cases", () => {
    expect(describeFailure(tEn, { code: "noneSelected" })).toBe(
      "No headband selected."
    );
    expect(describeFailure(tIt, { code: "noneSelected" })).toBe(
      it.device.errors.noneSelected
    );
    expect(
      describeFailure(tEn, { code: "connectFailed", detail: "boom" })
    ).toBe("Could not connect (boom).");
    expect(describeFailure(tIt, { code: "other", message: "as given" })).toBe(
      "as given"
    );
  });
});
