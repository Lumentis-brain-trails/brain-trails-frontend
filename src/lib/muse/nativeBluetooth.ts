/**
 * Web Bluetooth, as far as `BluetoothMuse` uses it, on top of a native BLE
 * stack.
 *
 * Safari -- and every other browser on iPhone and iPad, all of which are
 * WebKit -- gives web pages no Bluetooth at all. There the webapp runs inside
 * the Brain Trails shell (a Capacitor WKWebView pointed at the same
 * deployment), and CoreBluetooth is reached through the
 * `@capacitor-community/bluetooth-le` plugin. Rather than a second Muse
 * driver, this file dresses the plugin up as the `Bluetooth` object the
 * existing driver already takes in its constructor: one driver, one set of
 * decoders, one capture format, whatever carries the bytes.
 *
 * Only the subset the driver touches is implemented -- `requestDevice`,
 * `gatt.connect/disconnect/connected`, `getPrimaryService`,
 * `getCharacteristic`, notifications and writes. Anything else is absent on
 * purpose, so a new use in the driver fails loudly in the type checker's
 * shadow (the cast in `nativeBluetooth`) rather than silently at runtime.
 */
import type { BleClientInterface } from "@capacitor-community/bluetooth-le";

/** The part of the plugin's client this adapter needs; tests pass a fake. */
export type BleBackend = Pick<
  BleClientInterface,
  | "initialize"
  | "requestDevice"
  | "connect"
  | "disconnect"
  | "getServices"
  | "startNotifications"
  | "stopNotifications"
  | "write"
  | "writeWithoutResponse"
>;

const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";

/**
 * Native stacks want full 128-bit UUID strings; Web Bluetooth also accepts the
 * 16-bit alias as a number (the Muse service is `0xfe8d`).
 */
export function canonicalUuid(uuid: BluetoothServiceUUID): string {
  if (typeof uuid === "number")
    return uuid.toString(16).padStart(8, "0") + BASE_UUID_SUFFIX;
  const lower = uuid.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(lower)) return `0000${lower}${BASE_UUID_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(lower)) return `${lower}${BASE_UUID_SUFFIX}`;
  return lower;
}

/** A `NotFoundError`, which is what Web Bluetooth raises for a missing attribute. */
function notFound(what: string): Error {
  const error = new Error(`${what} not found`);
  error.name = "NotFoundError";
  return error;
}

function asDataView(value: BufferSource): DataView {
  return ArrayBuffer.isView(value)
    ? new DataView(value.buffer, value.byteOffset, value.byteLength)
    : new DataView(value);
}

class NativeCharacteristic extends EventTarget {
  value: DataView | null = null;
  private notifying = false;

  constructor(
    private readonly ble: BleBackend,
    private readonly deviceId: string,
    private readonly serviceUuid: string,
    readonly uuid: string
  ) {
    super();
  }

  async startNotifications(): Promise<this> {
    if (this.notifying) return this;
    await this.ble.startNotifications(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      (value) => {
        this.value = value;
        // `target` is this object once dispatched, as the driver expects.
        this.dispatchEvent(new Event("characteristicvaluechanged"));
      }
    );
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<this> {
    if (!this.notifying) return this;
    this.notifying = false;
    await this.ble.stopNotifications(
      this.deviceId,
      this.serviceUuid,
      this.uuid
    );
    return this;
  }

  writeValueWithoutResponse(value: BufferSource): Promise<void> {
    return this.ble.writeWithoutResponse(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      asDataView(value)
    );
  }

  writeValue(value: BufferSource): Promise<void> {
    return this.ble.write(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      asDataView(value)
    );
  }
}

class NativeService {
  private cache = new Map<string, NativeCharacteristic>();

  constructor(
    private readonly ble: BleBackend,
    private readonly deviceId: string,
    readonly uuid: string,
    private readonly characteristics: ReadonlySet<string>
  ) {}

  async getCharacteristic(
    uuid: BluetoothCharacteristicUUID
  ): Promise<NativeCharacteristic> {
    const id = canonicalUuid(uuid);
    // The driver probes for the Athena's characteristic and takes the error as
    // "older band"; writing to one that is not there would hang instead.
    if (!this.characteristics.has(id)) throw notFound(`Characteristic ${id}`);
    let characteristic = this.cache.get(id);
    if (!characteristic) {
      characteristic = new NativeCharacteristic(
        this.ble,
        this.deviceId,
        this.uuid,
        id
      );
      this.cache.set(id, characteristic);
    }
    return characteristic;
  }
}

class NativeGattServer {
  connected = false;

  constructor(
    private readonly ble: BleBackend,
    private readonly device: NativeDevice
  ) {}

  async connect(): Promise<this> {
    await this.ble.connect(this.device.id, () => this.dropped());
    this.connected = true;
    return this;
  }

  disconnect(): void {
    if (!this.connected) return;
    // Web Bluetooth's disconnect is synchronous and fires the event; the
    // native call is not awaited for the same reason the driver does not.
    void this.ble.disconnect(this.device.id).catch(() => {});
    this.dropped();
  }

  async getPrimaryService(uuid: BluetoothServiceUUID): Promise<NativeService> {
    const id = canonicalUuid(uuid);
    const services = await this.ble.getServices(this.device.id);
    const service = services.find((s) => canonicalUuid(s.uuid) === id);
    if (!service) throw notFound(`Service ${id}`);
    return new NativeService(
      this.ble,
      this.device.id,
      id,
      new Set(service.characteristics.map((c) => canonicalUuid(c.uuid)))
    );
  }

  /** Link lost or closed: report it once, as the browser would. */
  private dropped(): void {
    if (!this.connected) return;
    this.connected = false;
    this.device.dispatchEvent(new Event("gattserverdisconnected"));
  }
}

class NativeDevice extends EventTarget {
  readonly gatt: NativeGattServer;

  constructor(
    ble: BleBackend,
    readonly id: string,
    readonly name: string | undefined
  ) {
    super();
    this.gatt = new NativeGattServer(ble, this);
  }
}

/**
 * Wrap a native BLE client as a `Bluetooth` for `BluetoothMuse`.
 *
 * `requestDevice` opens the plugin's own device sheet. The plugin ANDs a
 * service filter with a name filter where Web Bluetooth ORs its filter list,
 * and Athena firmware does not always advertise the service, so the name
 * prefix alone selects headbands; the services are passed along as optional.
 */
export function nativeBluetooth(ble: BleBackend): Bluetooth {
  let initialized: Promise<void> | null = null;
  const adapter = {
    async requestDevice(options?: RequestDeviceOptions) {
      initialized ??= ble.initialize();
      await initialized;
      const filters =
        (options && "filters" in options && options.filters) || [];
      const namePrefix = filters.find((f) => f.namePrefix)?.namePrefix;
      const services = [
        ...filters.flatMap((f) => f.services ?? []),
        ...(options?.optionalServices ?? []),
      ].map(canonicalUuid);
      const found = await ble.requestDevice({
        ...(namePrefix ? { namePrefix } : { services }),
        optionalServices: [...new Set(services)],
      });
      return new NativeDevice(ble, found.deviceId, found.name);
    },
  };
  return adapter as unknown as Bluetooth;
}

/** True inside the native shell, where the Capacitor bridge is injected. */
export function isNativeShell(
  scope: { Capacitor?: { isNativePlatform?: () => boolean } } = globalThis as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
): boolean {
  return scope.Capacitor?.isNativePlatform?.() === true;
}

/**
 * True on iPhone and iPad. iPadOS Safari calls itself a Mac, so a touch screen
 * on a "Mac" is read as an iPad; no Mac has one.
 */
export function isAppleMobile(
  nav:
    | Pick<Navigator, "userAgent" | "maxTouchPoints">
    | undefined = globalThis.navigator
): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
}

/**
 * The shell's Bluetooth. The plugin is imported on demand so browsers that
 * have Web Bluetooth -- or no Bluetooth at all -- never download it.
 */
export async function loadNativeBluetooth(): Promise<Bluetooth> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  return nativeBluetooth(BleClient);
}
