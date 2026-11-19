## What this changes

<!-- One or two sentences. The behaviour change, not the file list. -->

## Why

<!-- The problem this solves, or the decision this records. -->

## How it was verified

<!--
Be specific. "pytest -q: 84 passed" or "walked Run → Report on the fault
dataset; anomalies table matches the Anomaly page" beats "tested locally".
-->

- [ ] `python -m pytest -q`
- [ ] `cd frontend && pnpm check`
- [ ] `cd frontend && pnpm build:static`
- [ ] Walked the affected stage end to end on a real dataset (if a stage changed)

## Screenshots

<!-- For UI changes: before / after. Delete this section otherwise. -->

## Notes for the reviewer

<!--
Anything worth knowing up front: a deliberate trade-off, a follow-up you
intentionally left out, a part you are unsure about. "Nothing" is a fine answer.
-->
