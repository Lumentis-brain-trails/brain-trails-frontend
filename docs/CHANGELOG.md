# Changelog

## Unreleased

- Record page: the Muse S Athena records too. Its multiplexed BLE protocol (one
  characteristic, 14-bit samples, 256 kHz device clock) has its own decoder in
  `src/lib/muse/athena.ts`; which generation is on the head is detected after
  pairing, not guessed. fNIRS is not recorded: the preset asked for (`p21`)
  leaves the optode array off, so a session file is the same four electrodes
  plus motion whichever headband produced it, and an Athena simply has no PPG
  rows. Packets now travel with the index of their first sample on the device
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
