# End-to-end tests

Playwright drives the real frontend against a real API and worker, with the simulated
headband in place of the Muse (plan V3, "Testing"). Tests live in `e2e/`; each sprint
adds its path (S13: record 30 s, upload, see the trail).

## Locally

1. In `../brain-trails-backend`, start Postgres and MinIO:
   `docker compose -f infra/docker-compose.yml up -d postgres minio`.
2. Export an environment that points **only** at those local services (never at Neon or
   AWS): `DATABASE_URL` and `DATABASE_URL_UNPOOLED` =
   `postgresql://postgres:postgres@localhost:5433/braintrails`,
   `S3_ENDPOINT_URL=http://localhost:9000`, `S3_BUCKET=brain-trails-test`,
   `AWS_ACCESS_KEY_ID=minioadmin`, `AWS_SECRET_ACCESS_KEY=minioadmin`, `EMBEDDER=fake`,
   `MAILER=manual`, `CORS_ORIGINS=http://localhost:3000`,
   `WORKER_WAKE_URL=http://localhost:9100/wake`.
3. With that environment, in the backend: `uv run alembic upgrade head`,
   `uv run scripts/seed_admin.py admin@example.com --password admin-pass-123`, then run
   `uv run uvicorn app.main:app --port 8000` and `uv run python -m worker.main`.
4. Here: `npx playwright install chromium` once, then `npm run e2e`. Playwright starts
   `npm run dev` on port 3000 unless something already listens there - make sure that
   something is this checkout.

`E2E_API_URL`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` override the defaults above.

## In CI

The `e2e` job in `.github/workflows/ci.yml` checks out the backend's `dev` branch, runs
it the same way on the runner, and runs the suite. The backend repo is private, so the
job needs the repository secret `E2E_BACKEND_TOKEN`: a fine-grained token with
**read-only Contents** access to `Lumentis-brain-trails/brain-trails-backend` and nothing
else. Without the secret the job passes with a notice that it skipped. On failure the
Playwright report, traces and the API and worker logs are uploaded as an artifact.

The job is **paused** (2026-09-20) so that small changes deploy quickly: it is skipped
unless the repository variable `E2E_ENABLED` is `true`. To run it once on a branch,
dispatch the workflow by hand: `gh workflow run ci --ref <branch>`. To bring it back on
every PR and push: `gh variable set E2E_ENABLED --body true`. Until then, run the suite
locally (`npm run e2e`) before a change that touches a user flow.
