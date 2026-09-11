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

| Path                                     | What                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/app/(public)/`                      | landing, login, register, verify, pending, privacy                                                                |
| `src/app/(app)/`                         | recordings list, recording detail (trail + signal + live polling), account                                        |
| `src/app/(admin)/admin/`                 | dashboard, registrations approval                                                                                 |
| `src/app/api/backend/[...path]/route.ts` | BFF proxy: allow-list `auth/`, `recordings`, `admin/`; attaches the cookie JWT                                    |
| `src/app/api/auth/{login,logout}/`       | cookie set/clear                                                                                                  |
| `src/middleware.ts`                      | redirects anonymous visitors of `/recordings`, `/admin` to `/login`                                               |
| `src/lib/api.ts`                         | browser client (`api.get/post/login/logout`)                                                                      |
| `src/lib/schemas.ts`                     | zod forms (account, profile, upload)                                                                              |
| `src/lib/types.ts`                       | API response types (mirror the backend `schemas.py`)                                                              |
| `src/components/`                        | `ui.tsx` primitives, `TrailPlot` (Plotly), `SignalPreview` (uPlot), `UploadDialog` (presigned S3), header, toasts |
| `docs/`                                  | ENVIRONMENTS, decisions                                                                                           |

## Commands

```bash
npm install
API_URL=http://localhost:8000 COOKIE_SECURE=false npm run dev
npm run lint && npm run format          # eslint, prettier --check
npm run build && npm run typecheck      # build first: typecheck needs generated route types
npm test                                # vitest with coverage thresholds (85% on lib/api/middleware)
```

## Conventions

- English everywhere: code, comments, JSDoc, commits, UI copy.
- JSDoc on exported functions/components explaining the why and the contract.
- Unit tests for `src/lib`, the BFF routes and middleware (security boundary);
  pages/components get e2e tests (Playwright, planned).
- New backend paths must be added to the BFF allow-list deliberately.
- Files never pass through the BFF (Vercel 4.5 MB cap): presigned direct-to-S3.
- Keep `@emnapi/*` exact devDependencies (Linux `npm ci` needs them).
- Conventional Commits; PR title becomes the squash commit.

## Working method (backend ADR 0013)

Branch from `dev` -> PR to `dev` -> `ci` green -> squash merge (feature PRs are not
reviewed by the autonomous reviewer) -> `promote` `action=open` to beta -> Alessio
dispatches `pr-review` on that PR (owner only, base `beta` only) -> `promote`
`action=merge` (refuses without a green review) ->
`promote` workflow to `beta`, then `main` (with `vX.Y.Z`). Never push to
`dev`/`beta`/`main` directly; rulesets enforce PRs on this repo.

## Session-start ritual (for Claude)

Read the wiki `index.md`; `git fetch && git status`; open PRs and last `ci` on `dev`;
`export GH_TOKEN=$(gh auth token --user anonymous2532)`.
