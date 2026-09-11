# Changelog

## Unreleased

- Record page: headband diagram with the four electrodes coloured by contact quality; the Muse's other sensors (accelerometer, gyroscope, PPG) are shown live and recorded into an `extras.csv` sidecar uploaded next to the session.
- Record page (sprint 11, step 2): Start/Stop a free session, summary sheet (duration, missing samples, clock, jitter), upload of the canonical Brain Trails session CSV straight to storage and into the pipeline.
- Record page (sprint 11, step 1): pair a Muse 2 over Web Bluetooth, four contact-quality lights, live 10 s signal, device card (battery, packet rate, lost packets, fitted clock). Own BLE driver (`src/lib/muse`) with a simulated headband for tests and non-production environments.

- Design system (Apple-inspired): monochrome tokens, system font, translucent chrome,
  press feedback and shared motion tokens; every page redesigned. Recording delete,
  account export/erase, drop-zone upload sheet. See `docs/DESIGN.md`.

- Repository scaffolding: Next.js app, tooling, CI, branch flow (Sprint 00).
