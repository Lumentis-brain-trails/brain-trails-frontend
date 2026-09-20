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
  type RawEvent,
} from "./device";
import {
  ACCELEROMETER_CHARACTERISTIC,
  AUX_CHARACTERISTIC,
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
/** Quirks of a particular band or browser, for the tests that need them. */
interface FakeQuirks {
  /** Characteristics that exist but refuse `startNotifications`. */
  refusesNotify?: string[];
  /** An older browser without `writeValueWithoutResponse`. */
  noWriteWithoutResponse?: boolean;
}

function fakeBluetooth(
  uuids: string[] = LEGACY_UUIDS,
  name = "Muse-1A2B",
  quirks: FakeQuirks = {}
) {
  const written: string[] = [];
  const writtenWithoutResponse: string[] = [];
  const characteristics = new Map<string, FakeCharacteristic>();
  class FakeCharacteristic extends EventTarget {
    value?: DataView;
    notifying = false;
    constructor(public uuid: string) {
      super();
    }
    async startNotifications() {
      if (quirks.refusesNotify?.includes(this.uuid))
        throw new DOMException("Not supported", "NotSupportedError");
      this.notifying = true;
      return this;
    }
    writeValueWithoutResponse = quirks.noWriteWithoutResponse
      ? undefined
      : async (bytes: Uint8Array) => {
          writtenWithoutResponse.push(decodeCommand(bytes));
          written.push(decodeCommand(bytes));
        };
    async writeValue(bytes: Uint8Array) {
      written.push(decodeCommand(bytes));
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
        getPrimaryService: async (s: string) =>
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
    writtenWithoutResponse,
    characteristics,
    requested,
  };
}

/** A command as it goes on the wire: length byte, ASCII, newline. */
function decodeCommand(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(1)).trim();
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

describe("BluetoothMuse chooser", () => {
  test("a browser that refuses the filter list is asked by name alone", async () => {
    const fake = fakeBluetooth();
    const requestDevice = vi.mocked(fake.bluetooth.requestDevice);
    const impl = requestDevice.getMockImplementation()!;
    requestDevice.mockImplementationOnce(async () => {
      throw new TypeError("Invalid filters");
    });
    requestDevice.mockImplementation(impl);
    const muse = new BluetoothMuse(fake.bluetooth);
    await muse.connect();
    expect(requestDevice).toHaveBeenCalledTimes(2);
    expect(requestDevice.mock.calls[1][0]).toEqual({
      filters: [{ namePrefix: "Muse" }],
      optionalServices: [MUSE_SERVICE],
    });
    expect(muse.model).toBe("muse-2");
  });

  test("closing the chooser is not retried", async () => {
    const fake = fakeBluetooth();
    const requestDevice = vi.mocked(fake.bluetooth.requestDevice);
    requestDevice.mockImplementationOnce(async () => {
      throw new DOMException("cancelled", "NotFoundError");
    });
    const muse = new BluetoothMuse(fake.bluetooth);
    await expect(muse.connect()).rejects.toMatchObject({
      name: "NotFoundError",
    });
    expect(requestDevice).toHaveBeenCalledTimes(1);
  });
});

describe("BluetoothMuse raw capture", () => {
  test("every notification goes out raw before decoding, commands too", async () => {
    const fake = fakeBluetooth([...LEGACY_UUIDS, AUX_CHARACTERISTIC]);
    const muse = new BluetoothMuse(fake.bluetooth);
    const raw: RawEvent[] = [];
    const eeg = vi.fn();
    muse.on("raw", (e) => raw.push(e));
    muse.on("eeg", eeg);
    await muse.connect();

    // The start sequence is captured as written, framing included.
    const out = raw.filter((e) => e.direction === "out");
    expect(out.map((e) => e.characteristic)).toEqual(
      Array(4).fill(CONTROL_CHARACTERISTIC)
    );
    expect(new TextDecoder().decode(out[1].bytes)).toBe("\x04p50\n");

    // Control replies and the AUX input are listened to, though nobody decodes them.
    expect(fake.characteristics.get(CONTROL_CHARACTERISTIC)?.notifying).toBe(
      true
    );
    expect(fake.characteristics.get(AUX_CHARACTERISTIC)?.notifying).toBe(true);
    const reply = new Uint8Array([3, 0x7b, 0x7d, 0x0a, 0xff]);
    fake.characteristics
      .get(CONTROL_CHARACTERISTIC)!
      .notify(new DataView(reply.buffer));
    const auxPacket = new Uint8Array(20).fill(7);
    fake.characteristics
      .get(AUX_CHARACTERISTIC)!
      .notify(new DataView(auxPacket.buffer));

    // A packet that the decoder rejects still reaches the capture.
    const short = new Uint8Array([1, 2, 3]);
    expect(() =>
      fake.characteristics
        .get(ACCELEROMETER_CHARACTERISTIC)!
        .notify(new DataView(short.buffer))
    ).not.toThrow();

    const incoming = raw.filter((e) => e.direction === "in");
    expect(incoming.map((e) => e.characteristic)).toEqual([
      CONTROL_CHARACTERISTIC,
      AUX_CHARACTERISTIC,
      ACCELEROMETER_CHARACTERISTIC,
    ]);
    expect(Array.from(incoming[0].bytes)).toEqual(Array.from(reply));
    expect(Array.from(incoming[2].bytes)).toEqual([1, 2, 3]);
    expect(eeg).not.toHaveBeenCalled();
  });

  test("a raw event owns its bytes: a reused buffer cannot rewrite it", async () => {
    const fake = fakeBluetooth();
    const muse = new BluetoothMuse(fake.bluetooth);
    const raw: RawEvent[] = [];
    muse.on("raw", (e) => raw.push(e));
    await muse.connect();
    const buf = new Uint8Array(20);
    buf[1] = 1;
    const tp9 = fake.characteristics.get(EEG_CHARACTERISTICS.TP9)!;
    tp9.notify(new DataView(buf.buffer));
    buf[1] = 2;
    tp9.notify(new DataView(buf.buffer));
    const eegRaw = raw.filter(
      (e) => e.characteristic === EEG_CHARACTERISTICS.TP9
    );
    expect(eegRaw.map((e) => e.bytes[1])).toEqual([1, 2]);
  });

  test("the simulator has no link to capture", async () => {
    const sim = new SimulatedMuse({ autoplay: false });
    const raw = vi.fn();
    sim.on("raw", raw);
    await sim.connect();
    sim.tick(0);
    expect(raw).not.toHaveBeenCalled();
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
    // The band will not start on one preset: it is primed on p21, started,
    // halted, moved to p1034 and started again. Each dc001 has its own L1.
    // Getting this wrong is the difference between a stream and silence.
    expect(fake.written).toEqual([
      "v6",
      "s",
      "h",
      "p21",
      "s",
      "dc001",
      "L1",
      "h",
      "p1034",
      "s",
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

  test("an aux characteristic that cannot notify does not cost us the stream", async () => {
    // Firmware that exposes 273e0014 without notify used to make connect()
    // reject, taking the working data characteristic down with it.
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C", {
      refusesNotify: [ATHENA_AUX_CHARACTERISTIC],
    });
    const muse = new BluetoothMuse(fake.bluetooth);
    const events: EegEvent[] = [];
    muse.on("eeg", (e) => events.push(e));
    await connectFast(muse);

    expect(muse.model).toBe("athena");
    expect(
      fake.characteristics.get(ATHENA_DATA_CHARACTERISTIC)?.notifying
    ).toBe(true);
    fake.characteristics.get(ATHENA_DATA_CHARACTERISTIC)!.notify(
      athenaMessage(
        athenaPacket({
          tick: 0,
          primaryTag: 0x11,
          primaryData: eegPayload([
            [0x2000, 0x2000, 0x2000, 0x2000],
            [0x2000, 0x2000, 0x2000, 0x2000],
            [0x2000, 0x2000, 0x2000, 0x2000],
            [0x2000, 0x2000, 0x2000, 0x2000],
          ]),
        })
      )
    );
    expect(events).toHaveLength(EEG_CHANNELS.length);
  });

  test("commands go out without a response when the browser offers it", async () => {
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C");
    await connectFast(new BluetoothMuse(fake.bluetooth));
    expect(fake.writtenWithoutResponse).toEqual(fake.written);

    // An older browser without the explicit method still gets the handshake.
    const old = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C", {
      noWriteWithoutResponse: true,
    });
    await connectFast(new BluetoothMuse(old.bluetooth));
    expect(old.writtenWithoutResponse).toEqual([]);
    expect(old.written).toEqual(fake.written);
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
    expect(motion[0].hostMs).toBe(motion[1].hostMs);
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

describe("BluetoothMuse on a Muse S Athena, raw", () => {
  test("optics are skipped by the decoder but kept byte for byte", async () => {
    const fake = fakeBluetooth(ATHENA_UUIDS, "MuseS-4B1C");
    const muse = new BluetoothMuse(fake.bluetooth);
    const raw: RawEvent[] = [];
    const eeg = vi.fn();
    muse.on("raw", (e) => raw.push(e));
    muse.on("eeg", eeg);
    await connectFast(muse);

    const optics = new Uint8Array(40).map((_, i) => i + 1);
    const message = athenaMessage(
      athenaPacket({ tick: 0, primaryTag: 0x36, primaryData: optics })
    );
    fake.characteristics.get(ATHENA_DATA_CHARACTERISTIC)!.notify(message);

    expect(eeg).not.toHaveBeenCalled();
    const data = raw.filter(
      (e) =>
        e.direction === "in" && e.characteristic === ATHENA_DATA_CHARACTERISTIC
    );
    expect(data).toHaveLength(1);
    expect(Array.from(data[0].bytes)).toEqual(
      Array.from(
        new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
      )
    );
    // The whole handshake went out on the control characteristic.
    expect(raw.filter((e) => e.direction === "out")).toHaveLength(12);
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
