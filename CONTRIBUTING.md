# Contributing to EcoMind AI

Thanks for taking the time to improve EcoMind. This guide is short on purpose: it
covers how to get a working environment, what a change should look like, and the
checks that must be green before a pull request is reviewed.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 1. Get a working environment

The fastest path is the launcher, which installs everything and seeds the
catalogue:

```bash
# Windows
ecomind.bat

# macOS / Linux
./ecomind.sh
```

For day-to-day development, run the pieces yourself:

```bash
python -m venv .venv
.venv/Scripts/activate           # Windows
source .venv/bin/activate         # macOS / Linux

pip install -r backend/requirements.txt
python backend/seed.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend
pnpm install
pnpm dev:static                  # HMR on :5173, proxies /api → :8000
```

Demo sign-in: `admin@ecomind.ai` / `admin123` (local evaluation only).

---

## 2. Find something to work on

- Bugs and small refinements: open an issue, or send a pull request directly if
  the change is obviously correct.
- Anything that touches the stage contract — a new field in a snapshot, a change
  to a stage's recorded output, a new route — please open an issue first. Those
  changes ripple through every screen that reads the snapshot, and it is cheaper
  to agree on the shape before writing it.
- `docs/STATUS.md` lists what is built, what is deliberately absent, and what is
  next. That file is the honest backlog.

---

## 3. What a good change looks like

**One concern per pull request.** A bug fix and a rename and a new feature in one
branch is three reviews pretending to be one, and the bug fix is the part that
gets reverted when the feature is.

**Follow the existing shape.** One service per stage in `backend/app/domain/`,
one view per stage in `frontend/client/src/components/shell/`, and every number
on screen read from the recorded snapshot rather than recomputed in the client.

**Comments explain why, not what.** The codebase is full of comments that record
a decision and its cost. Match that. A comment that restates the line above it is
noise; a comment that explains why the obvious approach was rejected is the most
valuable thing in the file.

**No fabricated values.** If a metric has not been computed, render it as absent.
A plausible-looking placeholder is worse than a blank, because a blank is
obviously a blank.

---

## 4. Checks that must pass

Run these before opening a pull request. They are the same commands CI runs (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)), so a green local run and
a green CI run mean the same thing.

```bash
# Backend
python -m pytest -q

# Frontend typecheck
cd frontend && pnpm check

# Frontend production build
cd frontend && pnpm build:static
```

A pull request that changes a pipeline stage should also be walked once end to
end — **Run** on a fresh dataset, then open each page — and the pull request
should say what you saw.

---

## 5. Commits and branches

Commit subjects follow the convention already in the history:

```
feat(ui): rebuild mission control around the handover
fix(deploy): copy pnpm-workspace.yaml so the frozen install succeeds
perf(deploy): seed the catalog at build time so a start is a server start
docs(readme): …
test(backend): …
```

Types: `feat`, `fix`, `perf`, `style`, `docs`, `test`, `refactor`, `build`,
`chore`. The scope is the area you touched (`ui`, `deploy`, `backend`, `api`,
`docs`, `launcher`).

The body should say **why** the change was made and what it was verified
against — "12 sections, all six exports 200" is a useful body line. "Updated
files" is not.

Branch from `main`; keep `main` deployable.

---

## 6. Reviewing

A reviewer will ask three things:

1. Does this change one thing, and does it do that thing completely?
2. Does every new number on screen trace to a recorded run?
3. Did the author actually run it, and what did they see?

Expect comments about the *why* more than the *what*. That is the house style,
not a personal objection.
