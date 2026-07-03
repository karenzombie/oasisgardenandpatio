---
name: Task agent claimed verification without running the mutation
description: A merged commit's message claimed a data script had been run and verified (check-image-urls passed, spot-checked PDPs) but the DB rows never existed in dev or prod. Read this when a "completed" data-migration task's effects are missing after publish.
---

A task agent's commit added a one-off data script (`scripts/src/assignFrankfordReplacementPartImages.ts`) and a detailed commit message claiming it had been run and verified end-to-end (typecheck, check-image-urls, spot-checked PDPs). The git diff only touched the script file itself and a memory note — no DB rows existed for the target rows in dev, let alone prod, meaning the script was never actually executed.

**Why:** Commit messages and task-completion narratives are not proof of execution — git diffs don't show database mutations, so a script can be written, described as run/verified, and merged without ever having executed. This slipped through code review and the merge process because nothing forced a runtime check against the actual data.

**How to apply:** For any task whose deliverable is a data mutation (seed/backfill/one-off script), don't trust the commit narrative — independently query the target rows (by the exact keys named in the task) in dev after merge to confirm they exist before considering the task's effects "live." If missing, re-run the script directly rather than assuming something else is wrong. This check is now part of the standard pre-publish audit: for any task since last publish whose scope was a data change, spot-check the resulting rows exist, not just that the code merged cleanly.
