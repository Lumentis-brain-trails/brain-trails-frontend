import { describe, expect, test, vi } from "vitest";
import { ATHENA_DATA_CHARACTERISTIC } from "./athena";
import { BluetoothMuse, bluetoothTransport, type EegEvent } from "./device";
import {
  canonicalUuid,
  isAppleMobile,
  isNativeShell,
  nativeBluetooth,
  type BleBackend,
} from "./nativeBluetooth";
import {
  ACCELEROMETER_CHARACTERISTIC,
  CONTROL_CHARACTERISTIC,
  EEG_CHANNELS,
  EEG_CHARACTERISTICS,
  GYROSCOPE_CHARACTERISTIC,
  PPG_CHARACTERISTICS,
  TELEMETRY_CHARACTERISTIC,
} from "./protocol";

const MUSE_SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb";

const LEGACY_UUIDS = [
  CONTROL_CHARACTERISTIC,
  TELEMETRY_CHARACTERISTIC,
  ACCELEROMETER_CHARACTERISTIC,
  GYROSCOPE_CHARACTERISTIC,
  ...Object.values(EEG_CHARACTERISTICS),
  ...Object.values(PPG_CHARACTERISTICS),
];

/** A native BLE client with one headband in range, as the plugin presents it. */
function fakeBackend(characteristics: string[] = LEGACY_UUIDS) {
  const notify = new Map<string, (value: DataView) => void>();
  const written: { characteristic: string; command: string; ack: boolean }[] =
    [];
  let onDisconnect: ((deviceId: string) => void) | undefined;
  const record = (ack: boolean) =>
    vi.fn(
      async (_d: string, _s: string, characteristic: string, v: DataView) => {
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        written.push({
          characteristic,
          command: new TextDecoder().decode(bytes.subarray(1)).trim(),
          ack,
        });
      }
    );
  const backend = {
    initialize: vi.fn(async () => {}),
    requestDevice: vi.fn(async () => ({
      deviceId: "A1B2-UUID",
      name: "Muse-1A2B",
    })),
    connect: vi.fn(async (_id: string, cb?: (deviceId: string) => void) => {
      onDisconnect = cb;
    }),
    disconnect: vi.fn(async () => {}),
    getServices: vi.fn(async () => [
      {
        // CoreBluetooth reports 16-bit services in short, upper-case form.
        uuid: "FE8D",
        characteristics: characteristics.map((uuid) => ({
          uuid: uuid.toUpperCase(),
          properties: {},
          descriptors: [],
        })),
      },
    ]),
    startNotifications: vi.fn(
      async (
        _d: string,
        _s: string,
        characteristic: string,
        cb: (value: DataView) => void
      ) => {
        notify.set(characteristic, cb);
      }
    ),
    stopNotifications: vi.fn(async () => {}),
    write: record(true),
    writeWithoutResponse: record(false),
  };
  return {
    backend: backend as unknown as BleBackend,
    spies: backend,
    notify,
    written,
    drop: () => onDisconnect?.("A1B2-UUID"),
  };
}

describe("canonicalUuid", () => {
  test("expands 16-bit aliases and lower-cases full UUIDs", () => {
    expect(canonicalUuid(0xfe8d)).toBe(MUSE_SERVICE_UUID);
    expect(canonicalUuid("FE8D")).toBe(MUSE_SERVICE_UUID);
    expect(canonicalUuid("0000FE8D")).toBe(MUSE_SERVICE_UUID);
    expect(canonicalUuid(CONTROL_CHARACTERISTIC.toUpperCase())).toBe(
      CONTROL_CHARACTERISTIC
    );
  });
});

describe("BluetoothMuse over the native bridge", () => {
  test("pairs by name, finds the service, subscribes and starts a Muse 2", async () => {
    const fake = fakeBackend();
    const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
    await muse.connect();

    expect(fake.spies.initialize).toHaveBeenCalledTimes(1);
    expect(fake.spies.requestDevice).toHaveBeenCalledWith({
      namePrefix: "Muse",
      optionalServices: [MUSE_SERVICE_UUID],
    });
    expect(muse.name).toBe("Muse-1A2B");
    expect(muse.model).toBe("muse-2");
    for (const channel of EEG_CHANNELS)
      expect(fake.notify.has(EEG_CHARACTERISTICS[channel])).toBe(true);
    // Commands go without response, to the control characteristic, in order.
    expect(fake.written.map((w) => w.command)).toEqual(["h", "p50", "s", "d"]);
    expect(fake.written.every((w) => !w.ack)).toBe(true);
    expect(
      fake.written.every((w) => w.characteristic === CONTROL_CHARACTERISTIC)
    ).toBe(true);
  });

  test("recognises an Athena by its multiplexed characteristic", async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeBackend([
        CONTROL_CHARACTERISTIC,
        ATHENA_DATA_CHARACTERISTIC,
      ]);
      const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
      const connecting = muse.connect();
      await vi.runAllTimersAsync();
      await connecting;
      expect(muse.model).toBe("athena");
      expect(fake.notify.has(ATHENA_DATA_CHARACTERISTIC)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("native notifications reach the decoders and the raw capture", async () => {
    const fake = fakeBackend();
    const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
    const events: EegEvent[] = [];
    const raw = vi.fn();
    muse.on("eeg", (e) => events.push(e));
    muse.on("raw", raw);
    await muse.connect();
    raw.mockClear();

    const packet = new Uint8Array(20);
    packet[1] = 0x2a;
    fake.notify.get(EEG_CHARACTERISTICS.AF8)!(new DataView(packet.buffer));

    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("AF8");
    expect(events[0].packet.sampleIndex).toBe(42 * 12);
    expect(raw).toHaveBeenCalledWith(
      expect.objectContaining({
        characteristic: EEG_CHARACTERISTICS.AF8,
        direction: "in",
        bytes: packet,
      })
    );
  });

  test("a dropped link is reported once; disconnect halts and releases", async () => {
    const fake = fakeBackend();
    const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
    const disconnected = vi.fn();
    muse.on("disconnected", disconnected);
    await muse.connect();

    await muse.disconnect();
    expect(fake.written.at(-1)?.command).toBe("h");
    expect(fake.spies.disconnect).toHaveBeenCalledWith("A1B2-UUID");
    expect(disconnected).toHaveBeenCalledTimes(1);
    fake.drop(); // the plugin's own callback after our disconnect
    expect(disconnected).toHaveBeenCalledTimes(1);
  });

  test("the headband walking out of range raises disconnected", async () => {
    const fake = fakeBackend();
    const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
    const disconnected = vi.fn();
    muse.on("disconnected", disconnected);
    await muse.connect();
    fake.drop();
    expect(disconnected).toHaveBeenCalledTimes(1);
  });

  test("a device without the Muse service is refused", async () => {
    const fake = fakeBackend();
    fake.spies.getServices.mockResolvedValueOnce([]);
    const muse = new BluetoothMuse(nativeBluetooth(fake.backend));
    await expect(muse.connect()).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  test("the Bluetooth can be supplied lazily", async () => {
    const fake = fakeBackend();
    const provider = vi.fn(async () => nativeBluetooth(fake.backend));
    const muse = new BluetoothMuse(provider);
    expect(provider).not.toHaveBeenCalled();
    await muse.connect();
    expect(provider).toHaveBeenCalledTimes(1);
  });
});

describe("characteristic adapter", () => {
  test("subscribes once, stops once, and falls back to acknowledged writes", async () => {
    const fake = fakeBackend();
    const device = await nativeBluetooth(fake.backend).requestDevice({
      filters: [{ services: [0xfe8d] }],
    });
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(0xfe8d);
    const control = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
    // Without a name filter the scan falls back to the service.
    expect(fake.spies.requestDevice).toHaveBeenCalledWith({
      services: [MUSE_SERVICE_UUID],
      optionalServices: [MUSE_SERVICE_UUID],
    });
    expect(await service.getCharacteristic(CONTROL_CHARACTERISTIC)).toBe(
      control
    );

    await control.startNotifications();
    await control.startNotifications();
    expect(fake.spies.startNotifications).toHaveBeenCalledTimes(1);
    await control.stopNotifications();
    await control.stopNotifications();
    expect(fake.spies.stopNotifications).toHaveBeenCalledTimes(1);

    await control.writeValue(new Uint8Array([2, 0x68, 0x0a]).buffer);
    expect(fake.written.at(-1)).toMatchObject({ command: "h", ack: true });
  });
});

describe("platform detection", () => {
  test("the shell is recognised by its Capacitor bridge", () => {
    expect(isNativeShell({})).toBe(false);
    expect(
      isNativeShell({ Capacitor: { isNativePlatform: () => false } })
    ).toBe(false);
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => true } })).toBe(
      true
    );
  });

  test("the transport prefers the shell, then Web Bluetooth, then nothing", () => {
    const scope = globalThis as { Capacitor?: unknown };
    expect(bluetoothTransport()).toBeNull();
    scope.Capacitor = { isNativePlatform: () => true };
    try {
      expect(bluetoothTransport()).toBe("native");
    } finally {
      delete scope.Capacitor;
    }
  });

  test("an iPad that calls itself a Mac is still an iPad", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1";
    expect(isAppleMobile({ userAgent: mac, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: mac, maxTouchPoints: 0 })).toBe(false);
    expect(
      isAppleMobile({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)",
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(
      isAppleMobile({
        userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140",
        maxTouchPoints: 5,
      })
    ).toBe(false);
    expect(isAppleMobile(undefined)).toBe(false);
  });
});
