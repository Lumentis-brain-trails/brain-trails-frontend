import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS shell: a WKWebView on the deployed webapp plus a CoreBluetooth
 * bridge, because no browser on iPhone or iPad gives a page Bluetooth.
 *
 * The app is not bundled. It has a BFF (cookies, route handlers), so it cannot
 * be a static export; the shell loads the deployment instead, and a release of
 * the site is a release of the app. `BT_SHELL_URL` points a build at another
 * environment (a preview, or `http://<mac-ip>:3000` for a local `next dev`).
 * `shell/` only holds the offline page Capacitor requires as `webDir`.
 */
const url =
  process.env.BT_SHELL_URL ??
  "https://brain-trails-frontend-lumentis1.vercel.app";

const config: CapacitorConfig = {
  appId: "work.lumentis.braintrails",
  appName: "Brain Trails",
  webDir: "shell",
  server: {
    url,
    cleartext: url.startsWith("http://"),
  },
  ios: {
    // The site draws its own safe-area padding; the web view is the app.
    contentInset: "never",
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Looking for a Muse…",
        cancel: "Cancel",
        availableDevices: "Headbands nearby",
        noDeviceFound: "No Muse found. Is it switched on?",
      },
    },
  },
};

export default config;
