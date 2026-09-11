# Git, GitHub and environments — Brain Trails

Applies to both repositories (`brain-trails-backend`, `brain-trails-frontend`).
Copied into each repo's `CONTRIBUTING.md` in Sprint 00.

---

## 1. Environments and branches

Three environments. Two human-managed permanent branches (`beta`, `main`) and one
**machine-built** branch (`dev`).

| Environment | Branch                | Contains                                                  | Deploy                                                |
| ----------- | --------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| **dev**     | `dev` (machine-built) | `beta` + every open, non-draft, green PR targeting `beta` | automatic on every rebuild of `dev`                   |
| **beta**    | `beta`                | merged, integration-tested work — release candidates      | automatic on push to `beta`                           |
| **prod**    | `main`                | released versions                                         | automatic on push to `main`, gated by manual approval |

More betas later = more `beta-N` branches + overlays + environments; purely additive.

### 1.1 Flow of a change

```
feat/42-upload-csv ──PR──▶ beta          (squash, through the merge queue)
                      │
                      └─(while open)──▶ dev is rebuilt = beta ⊕ all open green PRs ──▶ dev env
beta ──release PR──▶ main                (merge commit + tag + manual approval)
```

1. Open an issue. Branch **from `beta`** (never from `dev`).
2. Open a PR targeting `beta`. CI runs lint/types/tests on the prospective merge result.
   For the frontend, Vercel also publishes a per-PR preview URL.
3. **The moment the PR is open and green, it is live on the dev environment**: a GitHub
   Action rebuilds `dev` as `beta` + all open eligible PRs (see 1.2) and force-pushes it;
   every rebuild redeploys dev. This is how "everything under construction is always
   online" works.
4. When the PR is approved, it lands on `beta` through the **merge queue**: GitHub
   creates the candidate merge, runs the full CI on it, and only merges if green — the
   merge is tested _before_ it exists on `beta`. Squash; the PR title becomes the commit.
   Push to `beta` → beta env deploys.
5. Release: PR `beta → main` titled `release: vX.Y.Z`, merge commit, required approval;
   on merge: tag `vX.Y.Z`, GitHub Release with generated notes, prod deploy.

### 1.2 The `dev` integration branch — rules of the game

`dev` is rebuilt by the `rebuild-dev` workflow on: PR opened / synchronized / reopened /
closed / labeled / unlabeled (base = `beta`), and on every push to `beta`.

A PR is **included** in `dev` when all of: open, not draft, targets `beta`, has the
`in-dev` label (added automatically when the PR is opened; remove it or add `skip-dev`
to opt out), latest commit's checks are **green**, and it merges cleanly in sequence
(ascending PR number, on top of `beta` and the previously merged PRs).

- A PR that fails to merge gets the `merge-conflict` label and one explanatory comment;
  it is skipped, everything else still lands in `dev`. Resolve by rebasing on `beta`.
- A PR with red/pending checks is skipped silently until green.
- `dev`'s history is rewritten on every rebuild: **never** branch from `dev`, never
  push to it manually, never reference its SHAs. It is an artifact, like a build.
- The rebuild workflow uses a concurrency group (one rebuild at a time, latest wins).

Rationale, trade-offs and the previously considered classic flow: decision 0011
(superseding 0005).

### 1.3 Hotfix

Severe prod bug: branch `hotfix/<issue>-<desc>` from `main`, PR to `main` (allowed by the
guard), then immediately back-merge `main` into `beta` (PR). Patch tag (`v1.2.0 → v1.2.1`).

### 1.4 Golden rules

- No direct commits to `beta` or `main`, ever. `dev` belongs to the robot.
- The work must stay **orthogonal**: one PR = one issue = one concern; PRs that touch the
  same files should be sequenced (draft the second until the first lands), not raced.
- If `dev` breaks, find the culprit by elimination: `skip-dev` label on the suspected PR
  → rebuild → check. The labels make this a two-minute operation.

---

## 2. Naming

### 2.1 Branches

`<type>/<issue-number>-<kebab-description>`, always lowercase, always with the issue number.
Types: `feat/`, `fix/`, `chore/`, `docs/`, `infra/`, `refactor/`, `test/`, `hotfix/`.
Examples: `feat/12-mind-monitor-parser`, `infra/31-kustomize-overlays`, `fix/58-pca-nan`.

### 2.2 Commits: Conventional Commits

`<type>(<area>): <imperative, lowercase, no trailing period>`
Types: `feat fix docs chore refactor test perf ci build`.
Areas backend: `api pipeline worker db auth storage infra`. Frontend: `ui auth api-client plot infra`.
Because PRs land squashed, **the PR title is what matters** and must follow the same
format — it becomes the commit on `beta`. Body explains the _why_; footer `Closes #12`.

### 2.3 Tags and versions

SemVer `vMAJOR.MINOR.PATCH`, `v0.x` until the first external user. Tags only on `main`.
Docker images: tagged with commit SHA and environment name; on `main` also the version.

### 2.4 Issues

Title: short imperative sentence, no prefix (labels carry the type).
Templates in `.github/ISSUE_TEMPLATE/`: `feature.yml` (context, expected behavior,
acceptance checklist, technical notes, dependencies), `bug.yml` (repro steps, expected,
observed, environment, logs), `task.yml` (technical work with no direct user value).

Labels — at least one per group:

| Group         | Values                                                          |
| ------------- | --------------------------------------------------------------- |
| `type:`       | `feature` `bug` `task` `docs`                                   |
| `area:`       | `api` `pipeline` `worker` `db` `frontend` `infra` `ci`          |
| `prio:`       | `p0` (blocks) `p1` (this sprint) `p2` (next) `p3` (backlog)     |
| workflow      | `in-dev` `skip-dev` `merge-conflict` (PR-only, machine-managed) |
| state         | `blocked` `needs-info` `good-first-issue`                       |
| `env:` (bugs) | `dev` `beta` `prod`                                             |

Milestones = sprints. One org-level Project board: Backlog / Sprint / In progress /
In review / In beta / Done. Automation: linked PR → In review; merged to beta → In beta;
released → Done.

### 2.5 Pull requests

Template `.github/pull_request_template.md`:

```
## What
<one sentence>
## Why
Closes #<issue>
## How to verify
- [ ] step 1
## Checklist
- [ ] PR title is a valid Conventional Commit (it becomes the squash commit)
- [ ] tests added or updated
- [ ] docs/ADR updated if a decision changed
- [ ] no secrets in the diff
- [ ] DB migration included if the schema changed (backend)
```

Rules: one PR does one thing; > ~400 diff lines → split. Draft until CI is green (drafts
are excluded from `dev`). Review comment prefixes: `nit:` optional, `blocking:` must fix,
`question:`. The author resolves threads and merges after approval. Release PRs carry a
different checklist: included issues, migrations to run, new env vars.

### 2.6 Branch protection (GitHub Rulesets)

| Rule                  | `dev`                              | `beta`                           | `main`                                                   |
| --------------------- | ---------------------------------- | -------------------------------- | -------------------------------------------------------- |
| Ruleset               | none — machine-owned by convention | yes                              | yes                                                      |
| Requires PR           | —                                  | yes                              | yes                                                      |
| Requires green checks | —                                  | yes (+ **merge queue** enabled)  | yes                                                      |
| Requires 1 approval   | —                                  | no while solo → yes with ≥2 devs | yes                                                      |
| Force push            | robot only                         | blocked                          | blocked                                                  |
| Deletion              | blocked                            | blocked                          | blocked                                                  |
| Allowed merge method  | —                                  | squash (via queue)               | merge commit                                             |
| Extra guard           | —                                  | —                                | `guard-promotion.yml`: head must be `beta` or `hotfix/*` |

GitHub does not scope merge methods per branch: enable squash + merge commit repo-wide;
the queue enforces squash on `beta`, the guard workflow + checklist enforce the rest.

---

## 3. Documentation that lives in the repos

Backend: `README.md` (run locally in 5 commands), `CONTRIBUTING.md` (this file),
`docs/plans/V0.0.0/` (this plan: architecture, decisions, sprints, questions),
`docs/RUNBOOK.md` (operations: secrets, failed jobs, key rotation, pod logs, restore),
`docs/CHANGELOG.md`, `docs/API.md` (exported OpenAPI), `.env.example` (every variable
commented, never real values).
Frontend: same skeleton; `docs/ARCHITECTURE.md` covers routing, BFF, cookie auth,
generated API types, chart components; `docs/ENVIRONMENTS.md` maps branch → Vercel deploy
→ API URL.

Decision records: `docs/plans/V0.0.0/decisions/NNNN-title.md` with
Status / Date / Context / Decision / Alternatives / Consequences / Exit cost. A record is
immutable once accepted; changing course = a new record that supersedes it.

---

## 4. CI/CD on GitHub Actions

### 4.1 Backend

`ci.yml` (PRs, merge queue, pushes to beta/main): `uv sync`; `ruff check` +
`ruff format --check`; `mypy`; `import-linter` (layering); `pytest` against service
containers (`pgvector/pgvector:pg16`, MinIO); `alembic upgrade head` on an empty DB +
`alembic check`. Must also run on `merge_group` events (that is what the queue tests).

`rebuild-dev.yml`: triggers as in §1.2; assembles `dev`; force-pushes; labels/comments
conflicting PRs. Uses `GITHUB_TOKEN` with `contents: write`, `pull-requests: write`.

`deploy.yml` (push to `dev`, `beta`, `main`): buildx multi-arch (arm64+amd64, GHCR
cache) → push `ghcr.io/lumentis-dev/brain-trails-{api,worker}:<sha>` and `:<env>`
(+ `:vX.Y.Z` on main) → `deploy` job bound to the GitHub Environment (`prod` has a
required reviewer) → decode `KUBECONFIG_B64` → `kustomize edit set image` → migration
Job **before** the api/worker rollout → `kubectl apply -k overlays/<env>` →
`kubectl rollout status`.

Application secrets (DB, S3, HF, JWT) never pass through CI: they live in a Kubernetes
`Secret` created once per namespace (RUNBOOK). CI holds only a namespace-scoped
ServiceAccount kubeconfig.

### 4.2 Frontend

`ci.yml`: `npm ci`, eslint, `tsc --noEmit`, vitest, `next build`; also on `merge_group`.
Deploys are Vercel's: `main` → Production; every branch and PR → Preview (this gives the
per-PR live URL); branch `beta` and branch `dev` have their own env vars and stable
aliases. The `dev` branch force-pushes just retrigger a Preview build — harmless.

### 4.3 GitHub Environments

| Repo     | Environment                | Secrets          | Variables               |
| -------- | -------------------------- | ---------------- | ----------------------- |
| backend  | `dev`                      | `KUBECONFIG_B64` | `K8S_NAMESPACE=bt-dev`  |
| backend  | `beta`                     | `KUBECONFIG_B64` | `K8S_NAMESPACE=bt-beta` |
| backend  | `prod` (required reviewer) | `KUBECONFIG_B64` | `K8S_NAMESPACE=bt-prod` |
| frontend | — (Vercel)                 | —                | —                       |

---

## 5. Sprints and rituals (even solo)

One-week sprints, Monday–Friday. Monday: pick sprint content (move issues, assign
milestone; never more than last sprint's throughput +20%). Friday: check `beta` health;
update `CHANGELOG.md` Unreleased. Release `beta → main` when beta ran a full sprint
without `p0/p1` bugs. Every sprint ends with one retrospective line in the sprint's
README: what slowed us down.

---

## CURRENT FLOW (since 2026-09-11, backend decision 0013)

The machine-built `dev` of section 1 stays suspended. What runs today:

1. Branch from `dev`; open a PR **to `dev`**. Required: `ci` green (eslint, prettier,
   build, typecheck, vitest with coverage thresholds). Squash merge. Feature PRs are
   not sent to the autonomous reviewer. Vercel posts a preview URL on every PR.
2. Every PR states its wiki impact and ships a PR to `brain-trails-wiki`.
3. Promotion to beta, two steps: **promote** (`target=beta`, `action=open`) opens
   the PR `dev -> beta` (or open it by hand). Then the owner dispatches
   **pr-review** with that PR number: the autonomous reviewer runs only for him and
   only on PRs targeting `beta`; blocking findings fail the check. Then **promote**
   (`action=merge`) merges, refusing without a green review; Vercel deploys on push.
   `beta -> main`: `promote` (`target=main`, `action=merge`, optional `vX.Y.Z`).
4. `guard-promotion` rejects hand-made PRs to `beta`/`main` from other branches
   (`hotfix/*` allowed). Rulesets require PRs on `dev`, `beta`, `main`.
5. dependabot targets `dev`, monthly; its PRs are not sent to the reviewer.
