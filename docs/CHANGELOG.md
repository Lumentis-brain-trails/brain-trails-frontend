# Changelog

## Unreleased

- The trail picture is readable again. It is framed on the path instead of on the
  whole Ball Mapper layout, which is three times wider than any trail drawn on it -
  the trail used to occupy under a third of the picture, and the bulk of its windows
  under a tenth. A long session is now summarised in time rather than drawn window by
  window: each sample is the mean of the windows it stands for, so a 40-minute
  recording is a path you can follow instead of a ball of yarn, and no window is
  dropped. The ground keeps only the regions the path passed through and carries one
  opacity for the whole of it, so regions union instead of stacking into grey fog.
  The same framing fix applies to the review trail and the list thumbnails.

- A new mark: the entry screen's two ribbons folded into one soft disc of light,
  the warm half and the cool half held apart by an S-shaped trail that runs off
  both ends. It replaces the trefoil knot, and with it the last blue in the
  product. It is the icon in the rail, the tab icon and the iOS app icon, and it
  also sits above the name on the entry screen and beside it in the auth header.

- The mark carries no ground of its own: both halves fade to transparent and the
  trail between them is a gap, so it takes the colour of the page behind it -
  white in the light appearance, black in the dark one. The tab icon, which has no
  page to take, switches its tile on `prefers-color-scheme` instead.

- Record page: the device card's buttons wrap instead of overflowing. With the
  simulator buttons shown (outside production) the row was wider than the card, which
  clips its content, so "Simulated" was partly hidden and, with wider fonts, could not
  be clicked at all - which is how the first CI end-to-end run failed.

- Foundations for plan V3 (sprint S13), nothing visible changes: API types generated
  from the backend's OpenAPI (`npm run api:types`, `src/lib/api-types.ts`); the API
  client and the BFF gain `PUT`, `PATCH` and `If-Match`/`ETag`, and the BFF allows
  `config`; `useFeature()` reads the backend's feature flags; next-intl with English
  as the only locale, API errors rendered from their code through `errors.*` keys, and
  a lint rule against inline strings on the V3 surfaces; a run-timing probe
  (`?probe=1`, never in prod); Playwright end-to-end tests with the simulated headband,
  locally and in CI once the `E2E_BACKEND_TOKEN` secret exists (`docs/E2E.md`).

- Record page on Bluefy (iPhone/iPad): pairing stopped at "choose a headband".
  The Muse service is now given as its full 128-bit UUID instead of the 16-bit
  number Chrome accepts, and a browser that refuses the list of chooser filters
  is asked again with the name filter alone.
- Bluetooth on iPhone and iPad. No browser there can use Bluetooth (WebKit has no
  Web Bluetooth), so the site now also runs inside a native shell
  (`capacitor.config.ts`, `ios/`): a web view on the same deployment with a
  CoreBluetooth bridge. `src/lib/muse/nativeBluetooth.ts` presents that bridge as
  the `Bluetooth` object the existing driver takes, so the decoders, the clock and
  the raw capture are shared; `bluetoothTransport()` reports `web`, `native` or
  none, and the plugin is only downloaded inside the shell. In Safari on iOS the
  record page now says why it cannot connect and where to go instead of naming
  "Chrome on a computer". Building and signing: `docs/IOS_SHELL.md`.
- Record page: nothing the headband sends is lost any more (backend decision
  V2-0006). Every Bluetooth notification and command is kept byte for byte in a
  raw capture (`src/lib/muse/capture.ts`) and uploaded as a third file,
  `ble.bin.gz`, next to the session and its extras; it starts with the handshake
  replies seen since connection. This keeps what no decoder reads yet: the
  Athena's optics stream (PPG and fNIRS), aux EEG channels, the Muse 2's AUX
  input, telemetry and control replies. The driver emits a `raw` event before
  decoding, so a packet a decoder rejects is still captured. The recording now
  also says which band produced it (`muse-s-athena` instead of always
  `muse-2`). A capture over the API's cap is left behind with a warning rather
  than failing the upload.
- Interface: the entry screen's look carries into the app. A collapsible sidebar
  (icon rail, opens over the page on hover) replaces the top header and gains
  Home, Protocols and the account; a light/dark switch in the sidebar (stored
  choice, else the system setting, no flash on load); trails, terrain paths and EEG
  channels are drawn in the ribbons' four colours; titles use Manrope; primary
  buttons are ink instead of blue. Sign in, register and the other auth screens sit
  on the dark ribbon ground. New Home page (start a trail, the week, recent trails
  drawn from their own data), now the landing page after sign-in. Recording and
  protocol runs switch to a full-screen focus mode. Removed the old `AppHeader`,
  `Wordmark` and the unused `TrailIllustration`; the protocol screens drop the
  Tailwind default palette for the design tokens.
- Record page: the Muse S Athena records too. Its multiplexed BLE protocol (one
  characteristic, 14-bit samples, 256 kHz device clock) has its own decoder in
  `src/lib/muse/athena.ts`; which generation is on the head is detected after
  pairing, not guessed. Starting it takes a two-step handshake (primed on
  `p21`, halted, then `p1034`, each start followed by its own `L1`); a band
  that is asked only once stays silent. fNIRS is not recorded: the optics
  stream arrives, because no preset gives motion without it, and is discarded
  in the decoder, so a session file is the same four electrodes plus motion
  whichever headband produced it, and an Athena has no PPG rows. Packets now travel with the index of their first sample on the device
  clock, so nothing above the driver depends on a band's packet size. The
  session header gains `device_model`.
- Record page: headband diagram with the four electrodes coloured by contact quality; the Muse's other sensors (accelerometer, gyroscope, PPG) are shown live and recorded into an `extras.csv` sidecar uploaded next to the session.
- Record page (sprint 11, step 2): Start/Stop a free session, summary sheet (duration, missing samples, clock, jitter), upload of the canonical Brain Trails session CSV straight to storage and into the pipeline.
- Record page (sprint 11, step 1): pair a Muse 2 over Web Bluetooth, four contact-quality lights, live 10 s signal, device card (battery, packet rate, lost packets, fitted clock). Own BLE driver (`src/lib/muse`) with a simulated headband for tests and non-production environments.

- Header: only the section being viewed is marked active. `/recordings` starts
  with `/record`, so both pills used to light up at once.

- Design system (Apple-inspired): monochrome tokens, system font, translucent chrome,
  press feedback and shared motion tokens; every page redesigned. Recording delete,
  account export/erase, drop-zone upload sheet. See `docs/DESIGN.md`.

- Repository scaffolding: Next.js app, tooling, CI, branch flow (Sprint 00).
