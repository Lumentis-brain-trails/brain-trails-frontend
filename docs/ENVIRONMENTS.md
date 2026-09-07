# Frontend environments

| Environment         | URL                                                | API                                                         | Deploy                                             |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| local               | http://localhost:3000 (`npm run dev`)              | compose API on :8000                                        | -                                                  |
| production (Vercel) | https://brain-trails-frontend-lumentis1.vercel.app | https://api-dev.63.182.39.169.sslip.io (AWS k3s, ns bt-dev) | manual: `vercel deploy --prod --yes` from the repo |

Vercel account: email `alessio@lumentis.ca` (team `lumentis1`), project
`brain-trails-frontend` (prj_85DjtZDiPlzDqbKbKQACBjtkEvUC). GitHub integration active: pushes to `dev`/`beta` create stable branch previews wired to their own API; pushes to `main` deploy production. The repo is public (Vercel Hobby requires it for org repos). Deployment Protection (Vercel SSO) was disabled to make the site public.
Production env vars: `COOKIE_SECURE=true`, `NEXT_PUBLIC_APP_ENV=prod`; `API_URL`
intentionally unset until a public API exists.
