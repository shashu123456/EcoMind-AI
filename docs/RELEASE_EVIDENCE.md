# EcoMind AI — release evidence

Measured on 2026-11-10. HEAD `6ca7521` (5 commits on top of `b483aa6`,
pushed as the last action of this session).

```
HEAD: 6ca7521          Date: 2026-11-10
Local pytest: 247 passed, 0 failed, 0 errors in 101.64 s (0:01:41)
Local tsc: pass
Local build: pass, largest chunk 742,497 bytes
Bundle budget: 742,497 / 1,000,000
CI runs: 42895838662 — success (all three jobs green)
Deploy URL: NOT VERIFIED
Deploy verified: NOT VERIFIED — no Docker daemon and no Fly.io CLI on this machine
Outstanding:
- The Docker image has not been built or run here; the Dockerfile is written and
  the build instructions are in docs/STATUS.md §7.
- No public demo deployment exists. TASK 7b (Render/Fly.io) was not performed.
- The 90-day synthetic campus forecast stage takes ~11 minutes; the 30-day
  reference datasets take 1-10 s.
- No Alembic migrations. Tables are created by Base.metadata.create_all().
- Open self-registration (POST /register) and the seeded demo credentials
  (admin@ecomind.ai / admin123) are for the single-tenant demo only.
```

## What was actually run

**Baseline (TASK 1)** — `docs/EVIDENCE_BASELINE.txt`:
- `ImportError: cannot import name 'generate' from 'app.domain.report_service'`
- Working tree dirty: 2 staged, 11 unstaged, 4 untracked.

**Fix (TASK 2, Option A)** — reverted `report_service.py` and `config.py` to
HEAD. Collection then succeeded; the full suite went from "cannot collect" to
**247 passed, 0 failed**.

Two pre-existing failures in `tests/test_forecast_projection.py` were fixed
after diagnosis, not by reverting:
- `is_future` now means "modelled, not metered" (`observed_energy_kwh is None`)
  instead of `day > today`, which made every persisted forecast read as entirely
  historical once its origin aged past the run date.
- The flat-line daily threshold moved 1.0% → 0.01%. The frozen-feature defect
  measures 0.00% exactly; the weekly-repeating projection for the
  constant-dominated Cold Storage facility measures 0.27% and the Cement Plant
  19.3%. 0.01% sits between them.

The seeded database held forecast rows from 2026-02-20 (nine months stale), so
the 9 datasets whose rows had aged were regenerated. Without this the chart
reader returns a nine-month-old projection and every downstream page shows it.

**Smoke test (TASK 4)** — all PASS:
- `GET /api/v1/health` → 200
- `POST /api/v1/auth/login` (admin@ecomind.ai / admin123) → 200
- Upload → 10 stages → 12-section report → `GET /workflows/{id}/report.pdf` →
  200, 16,201 bytes, starts `%PDF`
- `GET /`, `/dashboard`, `/lab/forecast` all serve the SPA (200), not 404

Stage timings on the Healthy Campus dataset: library 0.0 s, import 24.1 s,
schema 7.0 s, quality 10.0 s, transformation 107.0 s, model selection 123.4 s,
anomaly 112.6 s, forecast 677.0 s, recommendation 1.2 s, report 0.6 s.

**Dependencies (TASK 5)** — `python-docx==1.2.0` and `python-pptx==1.0.2`
pinned (imported by `routes/reports.py` but absent from `requirements.txt`, so
a fresh deploy 500ed on DOCX/PPTX export); `python-jose[cryptography]` bumped
3.3.0 → 3.4.0 (3.3.0 carries published advisories). 12 frontend deps with zero
imports removed; `pnpm install` regenerated the lockfile; `tsc` and the build
still pass.

**Containerize (TASK 7)** — `Dockerfile` and `.dockerignore` written per spec.
No Docker daemon and no Fly.io CLI on this machine, so the image was not built
and no demo was deployed. Reported as NOT VERIFIED rather than claimed.

**CI (TASK 8)** — the first push failed all three jobs; four follow-up commits
fixed each:
- Frontend: `useSound.ts` had two TS errors that only surface under Node 20
  (this machine runs Node 25). Fixed.
- Backend: `No module named pytest` — CI installs from `requirements.txt`
  alone, which lacked it. `pytest==8.2.2` added.
- Backend: every API test failed with "Invalid email or password" — the CI job
  never seeded the database. `python seed.py` added before the test step.
- Backend: the seed command ran from `backend/` so `backend/seed.py` resolved
  to `backend/backend/seed.py`. Made relative.
- Fresh-clone: `./ecomind.sh: Permission denied` — the script was stored as
  100644. `git update-index --chmod=+x` applied; the launcher's npm fallback
  could not resolve the pnpm lockfile, so pnpm was set up in that job too.

Run `42895838662` is **success** with all three jobs green.