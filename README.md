# brain-trails-frontend

Brain Trails is the early prototype to showcase the potential of LuMentis. It takes an
EEG recording during a certain task and turns it into a 2D embedding map with the trail
the person traveled during the task. This repository is the web frontend (Next.js).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test
npm run typecheck
```

## Where things are

| Path              | What                                                         |
| ----------------- | ------------------------------------------------------------ |
| `src/app/`        | App Router pages and API route handlers (BFF from Sprint 05) |
| `src/components/` | UI components (trail plot, signal preview, ...)              |
| `assets/`         | design assets (loader, ...)                                  |
| `CONTRIBUTING.md` | branch flow, PR rules — read before your first PR            |

The full plan (architecture, decisions, sprints) lives in the backend repo under
`docs/plans/V0.0.0/`.

## Contributing

Branch from `beta`, open a PR to `beta`; every open green PR is auto-deployed to the dev
environment; releases go `beta → main` by PR. Details in [CONTRIBUTING.md](CONTRIBUTING.md).
