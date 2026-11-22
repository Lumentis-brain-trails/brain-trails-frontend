# Brain Trails console

The console for the people who run the project (backend plan OPS, OPS-0002/0003): a
launcher of versioned apps, a side rail, a widget strip of snapshots. It talks to two
services through its own BFF and never lets the browser hold a token:

- `bt-ops` (`OPS_API_URL`, with `OPS_BFF_KEY`): sign-in and the second factor, the app
  index, pins, the strip, snapshots, each app's reads;
- the product API (`API_URL`): the product login, and product actions (`/admin/*`).

## Run it

```bash
npm install                                  # at the repository root (workspace)
cd console
OPS_API_URL=http://localhost:8100 API_URL=http://localhost:8000 COOKIE_SECURE=false npm run dev
```

With the backend's `make ops-run` and an account added by `scripts/ops_user.py add`,
open http://localhost:3100. `npm run api:types` regenerates `src/lib/ops-types.ts` from
the backend's `docs/api/ops-openapi.json`.

## An app

`apps/<slug>/manifest.tsx` names the slug and the version this build draws, its page and
its widget renderers; `src/apps.ts` registers it. The backend's
`console/apps/<slug>/manifest.py` holds the same slug and version with the scopes, panels
and widgets it serves (`src/apps.test.ts` keeps the two in step). An app imports
`@console/*` and the product's `@/*`, never another app (ESLint).

An app that reads product data sets `followsEnv: true` (backend OPS-0005): the shell puts
the dev/beta/prod switch and the environment's colour in its header, keeps the choice in
`?env=` (and per app in localStorage), and everything inside reads through `useOps()` /
`useSnapshot`, which send `X-Ops-Env`. Product actions act on the home environment only,
so such an app hides them elsewhere (`useOpsEnv().isHome`, `ElsewhereNotice`).

## Vercel

A second project on this repository with root directory `console/`; environment
`OPS_API_URL`, `OPS_BFF_KEY`, `API_URL`; `vercel.json` deploys `dev`, `beta`, `main`.
