# CLAUDE.md - brain-trails-frontend

Read this first, then the wiki index:
https://github.com/Lumentis-brain-trails/brain-trails-wiki/blob/main/index.md
(local clone: `../brain-trails-wiki`). Framework rules for this Next.js version:
@AGENTS.md (auto-maintained by `next dev`; read `node_modules/next/dist/docs/` before
touching routing, caching or server/client boundaries).

## What this repo is

Next.js 16 App Router frontend of Brain Trails, deployed by Vercel's git integration
(`main` -> production, `dev`/`beta` -> stable previews). The browser never talks to
the API directly: route handlers under `src/app/api/` are the BFF and hold the JWT in
the httpOnly cookie `bt_token`. This repo is **public** (Vercel Hobby constraint):
nothing secret may ever be committed.

## Code map

| Path                                                    | What                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(public)/`                                     | landing, login, register, verify, pending, privacy                                                                                                                                                                                                                                                                                                                                                       |
| `src/app/(app)/`                                        | home, `protocols` (catalog; `[id]` detail and Play; `[id]/run` headband pre-flight, run with EEG, upload at finish; `media` your uploads, its own section), recordings, neurometrics, account; `/library` and `/record` redirect                                                                                                                                                                         |
| `src/app/(admin)/admin/`                                | dashboard, `applications` (beta selection board: decide, cohorts; backend V3-0008)                                                                                                                                                                                                                                                                                                                       |
| `src/app/api/backend/[...path]/route.ts`                | BFF proxy: allow-list `auth/`, `recordings`, `admin/`, `sessions`, `media`, `protocols`, `config`, `workspaces`; attaches the cookie JWT; forwards `etag` and `x-next-cursor`                                                                                                                                                                                                                            |
| `src/app/api/auth/{login,logout}/`                      | cookie set/clear                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/middleware.ts`                                     | redirects anonymous visitors of the authenticated areas to `/login`                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/api.ts`                                        | browser client (`api.get/post/login/logout`)                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/schemas.ts`                                    | zod forms (account, profile, upload)                                                                                                                                                                                                                                                                                                                                                                     |
| `src/lib/landscape.ts`                                  | energy field from node positions + masses; mirrors `pipeline/neurometrics/landscape.py`                                                                                                                                                                                                                                                                                                                  |
| `src/lib/terrainMesh.ts`                                | energy field -> 3D vertex grid + trail path, framework-free (Three.js lives in `TerrainScene`)                                                                                                                                                                                                                                                                                                           |
| `src/lib/types.ts`                                      | API response types: recordings, media and sessions aliased from the generated `api-types.ts`; the rest still by hand                                                                                                                                                                                                                                                                                     |
| `src/lib/workspace.ts`                                  | `useWorkspaces`, `useCurrentWorkspace`, `inWorkspace`: every list call names its workspace (backend V3-0001); no switcher until S22                                                                                                                                                                                                                                                                      |
| `src/lib/application.ts`, `src/components/application/` | beta application: zod rules per profile, device/browser/Web Bluetooth detection, the registration step (flag `beta_applications`, strings via next-intl)                                                                                                                                                                                                                                                 |
| `src/lib/api-types.ts`                                  | generated from the backend's `docs/api/openapi.json` (`npm run api:types`); never edited by hand                                                                                                                                                                                                                                                                                                         |
| `src/lib/features.ts`                                   | `useFeature(name)`: flags from `GET /config` (plan V3 deploy table); unknown state = off                                                                                                                                                                                                                                                                                                                 |
| `messages/`, `src/i18n/`                                | next-intl: English only until S26; every new UI string is a key; `no-literal-string` lint on the V3 surfaces                                                                                                                                                                                                                                                                                             |
| `src/lib/timing/`                                       | run-timing probe (dropped frames, onset error); overlay with `?probe=1` outside prod                                                                                                                                                                                                                                                                                                                     |
| `e2e/`, `playwright.config.ts`                          | Playwright against a real API + worker with the simulated headband (`docs/E2E.md`)                                                                                                                                                                                                                                                                                                                       |
| `src/components/`                                       | `ui.tsx` primitives, `TrailPlot` (flat/terrain toggle) with `TerrainScene` (react-three-fiber), `BallMapperGraph`/`MetricCurve` (Plotly), `SignalPreview` (uPlot), `UploadDialog`, `AppShell` (sidebar, appearance switch), toasts                                                                                                                                                                       |
| `src/lib/protocol/`                                     | the runtime: `tree.ts` + `resolve.ts` (a stored protocol tree + the session seed -> the flat plan), `media.ts` (media ids -> links), `schema.ts`/`registry.ts` (each kind's config), `catalog.ts` (`/protocols` types, `planFor`), `session.ts` (start, plan, finish, capture upload); `schemas/` holds the exported JSON Schema and the official templates (`npm run schemas`; the backend copies them) |
| `src/components/protocol/`                              | `ProtocolRunner` (one step at a time, stamps every marker) and `kinds/` (one file per block kind: instructions, fixation, baseline, rest, countdown, video, audio, text, questionnaire, quiz, breathing, go/no-go, image sets)                                                                                                                                                                           |
| `src/lib/muse/`                                         | Muse driver: `device.ts` (one driver over Web Bluetooth or the native bridge), `nativeBluetooth.ts` (Capacitor BLE dressed as `Bluetooth`), decoders, capture                                                                                                                                                                                                                                            |
| `capacitor.config.ts`, `ios/`, `shell/`                 | the iOS shell: web view on the deployment + CoreBluetooth, because iOS browsers have no Bluetooth (`docs/IOS_SHELL.md`)                                                                                                                                                                                                                                                                                  |
| `docs/`                                                 | ENVIRONMENTS, decisions                                                                                                                                                                                                                                                                                                                                                                                  |

## Commands

```bash
npm install
API_URL=http://localhost:8000 COOKIE_SECURE=false npm run dev
npm run lint && npm run format          # eslint, prettier --check
npm run build && npm run typecheck      # build first: typecheck needs generated route types
npm test                                # vitest with coverage thresholds (85% on lib/api/middleware)
npm run api:types                       # regenerate src/lib/api-types.ts from the backend's OpenAPI
npm run e2e                              # Playwright; needs the local backend (docs/E2E.md)
```

## Conventions

- English everywhere: code, comments, JSDoc, commits, UI copy. New UI copy lives in
  `messages/en.json` and is read through next-intl, never written inline.
- JSDoc on exported functions/components explaining the why and the contract.
- Unit tests for `src/lib`, the BFF routes and middleware (security boundary);
  pages/components get e2e tests (Playwright, `e2e/`).
- New backend paths must be added to the BFF allow-list deliberately.
- Files never pass through the BFF (Vercel 4.5 MB cap): presigned direct-to-S3.
- Keep `@emnapi/*` exact devDependencies (Linux `npm ci` needs them).
- Conventional Commits; PR title becomes the squash commit.

## Working method (backend ADR 0013)

Branch from `dev` -> PR to `dev` -> `ci` green -> squash merge (feature PRs are not
reviewed by the autonomous reviewer) -> `promote` `action=open` to beta -> Alessio
dispatches `pr-review` on that PR (owner only, base `beta` only) -> `promote`
`action=merge` (the review is optional; it never blocks the merge) ->
`promote` workflow to `beta`, then `main` (with `vX.Y.Z`). Never push to
`dev`/`beta`/`main` directly; rulesets enforce PRs on this repo.

## Session-start ritual (for Claude)

Read the wiki `index.md`; `git fetch && git status`; open PRs and last `ci` on `dev`;
`export GH_TOKEN=$(gh auth token --user anonymous2532)`.
