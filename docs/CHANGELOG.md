# Changelog

## Unreleased

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
