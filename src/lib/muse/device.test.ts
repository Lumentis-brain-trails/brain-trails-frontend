import { describe, expect, test, vi } from "vitest";
import {
  ATHENA_AUX_CHARACTERISTIC,
  ATHENA_DATA_CHARACTERISTIC,
  ATHENA_UV_PER_COUNT,
} from "./athena";
import { athenaMessage, athenaPacket, eegPayload } from "./athena.fixture";
import {
  BluetoothMuse,
  isWebBluetoothSupported,
  SimulatedMuse,
  type EegEvent,
  type MotionEvent,
  type PpgEvent,
} from "./device";
import {
  ACCELEROMETER_CHARACTERISTIC,
  CONTROL_CHARACTERISTIC,
  EEG_CHANNELS,
  EEG_CHARACTERISTICS,
  GYROSCOPE_CHARACTERISTIC,
  MUSE_SERVICE,
  PPG_CHARACTERISTICS,
  TELEMETRY_CHARACTERISTIC,
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
    expect(events[0].packet.sampleIndex).toBe(65535 * 12);
    expect(events[4].packet.sampleIndex).toBe(0); // the counter wrapped
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

/** The characteristics a Muse 2 or Muse S (gen 2) exposes. */
const LEGACY_UUIDS = [
  CONTROL_CHARACTERISTIC,
  TELEMETRY_CHARACTERISTIC,
  ACCELEROMETER_CHARACTERISTIC,
  GYROSCOPE_CHARACTERISTIC,
  ...Object.values(EEG_CHARACTERISTICS),
  ...Object.values(PPG_CHARACTERISTICS),
];

/** What an Athena exposes instead: control plus the multiplexed data pipes. */
const ATHENA_UUIDS = [
  CONTROL_CHARACTERISTIC,
  ATHENA_DATA_CHARACTERISTIC,
  ATHENA_AUX_CHARACTERISTIC,
];

/**
 * Minimal fake of the Web Bluetooth object graph the driver touches. Only the
 * listed characteristics exist, because asking for a missing one is how the
 * driver tells the two generations apart.
 */
function fakeBluetooth(uuids: string[] = LEGACY_UUIDS, name = "Muse-1A2B") {
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
  const available = new Set(uuids);
  const service = {
    async getCharacteristic(uuid: string) {
      if (!available.has(uuid))
        throw new DOMException(`No characteristic ${uuid}`, "NotFoundError");
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
  const device = Object.assign(new EventTarget(), { name, gatt });
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
    expect(muse.model).toBe("muse-2");
    expect(fake.requested[0]).toEqual({
      filters: [{ services: [MUSE_SERVICE] }, { namePrefix: "Muse" }],
      optionalServices: [MUSE_SERVICE],
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
    expect(events[0].packet.sampleIndex).toBe(42 * 12);
    await muse.disconnect();
    expect(fake.written.at(-1)).toBe("h");
    expect(disconnected).toHaveBeenCalled();
  });
});

/** Connect with the command waits collapsed, so the test does not sleep. */
async function connectFast(muse: BluetoothMuse) {
  vi.useFakeTimers();
  try {
    const connecting = muse.connect();
    await vi.runAllTimersAsync();
    await connecting;
  } finally {
    vi.useRealTimers();
  }
}

describe("BluetoothMuse on a Muse S Athena", () => {
  test("recognises the band by its characteristics and primes the stream", async () => {
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C");
    const muse = new BluetoothMuse(fake.bluetooth);
    await connectFast(muse);

    expect(muse.model).toBe("athena");
    expect(muse.name).toBe("MuseS-4B1C");
    // p21 is the preset without the optode array: EEG and motion only.
    expect(fake.written).toEqual([
      "v6",
      "s",
      "h",
      "p21",
      "s",
      "dc001",
      "dc001",
      "L1",
    ]);
    expect(
      fake.characteristics.get(ATHENA_DATA_CHARACTERISTIC)?.notifying
    ).toBe(true);
    expect(fake.characteristics.get(ATHENA_AUX_CHARACTERISTIC)?.notifying).toBe(
      true
    );
    // The per-electrode characteristics of the older bands are not there.
    expect(fake.characteristics.has(EEG_CHARACTERISTICS.TP9)).toBe(false);
  });

  test("hands the four electrodes to listeners on the device clock", async () => {
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C");
    const muse = new BluetoothMuse(fake.bluetooth);
    const events: EegEvent[] = [];
    const ppg = vi.fn();
    muse.on("eeg", (e) => events.push(e));
    muse.on("ppg", ppg);
    await connectFast(muse);

    const rows = (base: number) => [
      [base + 1, base + 2, base + 3, base + 4],
      [base + 1, base + 2, base + 3, base + 4],
      [base + 1, base + 2, base + 3, base + 4],
      [base + 1, base + 2, base + 3, base + 4],
    ];
    const ticksPerSample = 1000; // 256 kHz clock, 256 Hz samples
    fake.characteristics.get(ATHENA_DATA_CHARACTERISTIC)!.notify(
      athenaMessage(
        athenaPacket({
          tick: 0,
          primaryTag: 0x11,
          primaryData: eegPayload(rows(0x2000)),
        }),
        athenaPacket({
          tick: 4 * ticksPerSample,
          primaryTag: 0x11,
          primaryData: eegPayload(rows(0x2000)),
        })
      )
    );

    // Two subpackets, four electrodes each, four samples per electrode.
    expect(events).toHaveLength(8);
    expect(events.slice(0, 4).map((e) => e.channel)).toEqual([...EEG_CHANNELS]);
    expect(events[0].packet.sampleIndex).toBe(0);
    expect(events[4].packet.sampleIndex).toBe(4);
    expect(events[0].packet.samples).toHaveLength(4);
    expect(events[0].packet.samples[0]).toBeCloseTo(ATHENA_UV_PER_COUNT, 4);
    // No PPG: that sensor is the fNIRS array, which the preset leaves off.
    expect(ppg).not.toHaveBeenCalled();
  });

  test("reads motion and battery out of the same stream", async () => {
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C");
    const muse = new BluetoothMuse(fake.bluetooth);
    const motion: MotionEvent[] = [];
    const telemetry = vi.fn();
    muse.on("motion", (e) => motion.push(e));
    muse.on("telemetry", telemetry);
    await connectFast(muse);

    const battery = new Uint8Array(188);
    new DataView(battery.buffer).setUint16(0, 64 * 256, true);
    const motionData = new Uint8Array(36);
    new DataView(motionData.buffer).setInt16(4, 16384, true); // 1 g on z
    fake.characteristics
      .get(ATHENA_AUX_CHARACTERISTIC)!
      .notify(
        athenaMessage(
          athenaPacket({ tick: 0, primaryTag: 0x47, primaryData: motionData }),
          athenaPacket({ tick: 0, primaryTag: 0x88, primaryData: battery })
        )
      );

    expect(motion.map((m) => m.kind)).toEqual(["acc", "gyro"]);
    expect(motion[0].packet.samples[2]).toBeCloseTo(1, 2);
    expect(motion[0].packet.sampleIndex).toBe(0);
    expect(telemetry).toHaveBeenCalledWith({
      sequence: 0,
      batteryPercent: 64,
      voltageMv: null,
      temperatureC: null,
    });
  });
});

describe("SimulatedMuse imitating an Athena", () => {
  test("sends the Athena's shorter EEG packets and no PPG", async () => {
    const sim = new SimulatedMuse({ autoplay: false, model: "athena" });
    const events: EegEvent[] = [];
    const ppg = vi.fn<(e: PpgEvent) => void>();
    sim.on("eeg", (e) => events.push(e));
    sim.on("ppg", ppg);
    await sim.connect();
    sim.tick(0);
    sim.tick(15.6);

    expect(sim.name).toBe("Athena-SIM");
    expect(events).toHaveLength(8);
    expect(events[0].packet.samples).toHaveLength(4);
    expect(events[4].packet.sampleIndex).toBe(4);
    expect(ppg).not.toHaveBeenCalled();
  });
});
