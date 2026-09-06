# Frontend environments

| Environment         | URL                                                | API                                                                                                  | Deploy                                             |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| local               | http://localhost:3000 (`npm run dev`)              | compose API on :8000                                                                                 | -                                                  |
| production (Vercel) | https://brain-trails-frontend-lumentis1.vercel.app | none yet (BFF answers 503 `backend_unavailable`); wired up in Sprint 08 when the API lands on Oracle | manual: `vercel deploy --prod --yes` from the repo |

Vercel account: email `alessio@lumentis.ca` (team `lumentis1`), project
`brain-trails-frontend` (prj_85DjtZDiPlzDqbKbKQACBjtkEvUC). No GitHub integration
yet (needs the org owner to install the Vercel GitHub app) - deploys are CLI-only
for now. Deployment Protection (Vercel SSO) was disabled to make the site public.
Production env vars: `COOKIE_SECURE=true`, `NEXT_PUBLIC_APP_ENV=prod`; `API_URL`
intentionally unset until a public API exists.
