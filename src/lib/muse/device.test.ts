import { describe, expect, test, vi } from "vitest";
import {
  BluetoothMuse,
  isWebBluetoothSupported,
  SimulatedMuse,
  type EegEvent,
} from "./device";
import {
  ACCELEROMETER_CHARACTERISTIC,
  EEG_CHANNELS,
  EEG_CHARACTERISTICS,
  MUSE_SERVICE,
  PPG_CHARACTERISTICS,
} from "./protocol";

describe("isWebBluetoothSupported", () => {
  test("false without navigator.bluetooth, true with requestDevice", () => {
    expect(isWebBluetoothSupported(undefined)).toBe(false);
    expect(isWebBluetoothSupported({} as Navigator)).toBe(false);
    expect(
      isWebBluetoothSupported({
        bluetooth: { requestDevice: async () => ({}) },
      } as unknown as Navigator)
    ).toBe(true);
  });
});

describe("SimulatedMuse", () => {
  test("emits one packet per channel with lockstep counters that wrap", async () => {
    const sim = new SimulatedMuse({
      autoplay: false,
      startCounter: 65535,
      flatChannels: ["AF7"],
    });
    const events: EegEvent[] = [];
    sim.on("eeg", (e) => events.push(e));
    await sim.connect();
    sim.tick(0);
    sim.tick(47);
    expect(events).toHaveLength(8);
    expect(events.slice(0, 4).map((e) => e.channel)).toEqual([...EEG_CHANNELS]);
    expect(events[0].packet.counter).toBe(65535);
    expect(events[4].packet.counter).toBe(0);
    expect(events[0].packet.samples).toHaveLength(12);
    expect(Array.from(events[1].packet.samples).every((v) => v === 0)).toBe(
      true
    ); // AF7 flat
    expect(
      Math.max(...Array.from(events[0].packet.samples).map(Math.abs))
    ).toBeGreaterThan(5);
  });

  test("emits motion at 52 Hz and PPG at 64 Hz alongside the EEG", async () => {
    const sim = new SimulatedMuse({ autoplay: false });
    const motion = vi.fn();
    const ppg = vi.fn();
    sim.on("motion", motion);
    sim.on("ppg", ppg);
    await sim.connect();
    for (let i = 0; i < 64; i++) sim.tick(i * 46.875); // 3 s of EEG
    // 3 s * 52 Hz / 3 samples = 52 packets per kind; 3 s * 64 / 6 = 32 per PPG channel
    expect(
      motion.mock.calls.filter((c) => c[0].kind === "acc").length
    ).toBeGreaterThanOrEqual(51);
    expect(
      ppg.mock.calls.filter((c) => c[0].channel === "infrared").length
    ).toBeGreaterThanOrEqual(31);
    expect(motion.mock.calls[0][0].packet.samples[2]).toBeCloseTo(1, 1); // gravity on z
  });

  test("telemetry every 21 packets, disconnect notifies", async () => {
    const sim = new SimulatedMuse({ autoplay: false });
    const telemetry = vi.fn();
    const disconnected = vi.fn();
    sim.on("telemetry", telemetry);
    sim.on("disconnected", disconnected);
    await sim.connect();
    for (let i = 0; i < 21; i++) sim.tick(i);
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(telemetry.mock.calls[0][0].batteryPercent).toBe(76);
    await sim.disconnect();
    expect(disconnected).toHaveBeenCalledTimes(1);
  });
});

/** Minimal fake of the Web Bluetooth object graph the driver touches. */
function fakeBluetooth() {
  const written: string[] = [];
  const characteristics = new Map<string, FakeCharacteristic>();
  class FakeCharacteristic extends EventTarget {
    value?: DataView;
    notifying = false;
    constructor(public uuid: string) {
      super();
    }
    async startNotifications() {
      this.notifying = true;
      return this;
    }
    async writeValue(bytes: Uint8Array) {
      written.push(new TextDecoder().decode(bytes.subarray(1)).trim());
    }
    notify(view: DataView) {
      this.value = view;
      this.dispatchEvent(new Event("characteristicvaluechanged"));
    }
  }
  const service = {
    async getCharacteristic(uuid: string) {
      if (!characteristics.has(uuid))
        characteristics.set(uuid, new FakeCharacteristic(uuid));
      return characteristics.get(uuid)!;
    },
  };
  const gatt = {
    connected: false,
    async connect() {
      gatt.connected = true;
      return {
        getPrimaryService: async (s: number) =>
          s === MUSE_SERVICE ? service : Promise.reject(),
      };
    },
    disconnect() {
      gatt.connected = false;
      device.dispatchEvent(new Event("gattserverdisconnected"));
    },
  };
  const device = Object.assign(new EventTarget(), { name: "Muse-1A2B", gatt });
  const bluetooth = {
    requestDevice: vi.fn(async (opts: RequestDeviceOptions) => {
      requested.push(opts);
      return device;
    }),
  };
  const requested: RequestDeviceOptions[] = [];
  return {
    bluetooth: bluetooth as unknown as Bluetooth,
    written,
    characteristics,
    requested,
  };
}

describe("BluetoothMuse", () => {
  test("filters on the Muse service, subscribes to the four electrodes, sends the start sequence", async () => {
    const fake = fakeBluetooth();
    const muse = new BluetoothMuse(fake.bluetooth);
    await muse.connect();
    expect(muse.name).toBe("Muse-1A2B");
    expect(fake.requested[0]).toEqual({
      filters: [{ services: [MUSE_SERVICE] }],
    });
    for (const ch of EEG_CHANNELS) {
      expect(fake.characteristics.get(EEG_CHARACTERISTICS[ch])?.notifying).toBe(
        true
      );
    }
    expect(fake.written).toEqual(["h", "p50", "s", "d"]);
    expect(
      fake.characteristics.get(ACCELEROMETER_CHARACTERISTIC)?.notifying
    ).toBe(true);
    expect(
      fake.characteristics.get(PPG_CHARACTERISTICS.infrared)?.notifying
    ).toBe(true);
  });

  test("decodes notifications into channel events and halts on disconnect", async () => {
    const fake = fakeBluetooth();
    const muse = new BluetoothMuse(fake.bluetooth);
    const events: EegEvent[] = [];
    const disconnected = vi.fn();
    muse.on("eeg", (e) => events.push(e));
    muse.on("disconnected", disconnected);
    await muse.connect();
    const buf = new Uint8Array(20);
    buf[0] = 0x00;
    buf[1] = 0x2a;
    fake.characteristics
      .get(EEG_CHARACTERISTICS.AF8)!
      .notify(new DataView(buf.buffer));
    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("AF8");
    expect(events[0].packet.counter).toBe(42);
    await muse.disconnect();
    expect(fake.written.at(-1)).toBe("h");
    expect(disconnected).toHaveBeenCalled();
  });
});
