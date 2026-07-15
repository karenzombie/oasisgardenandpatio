---
name: No auto-patching deployment/data failures
description: Rule for what to do when any deployment, prod data sync, or script fails in prod. Applies to catalog syncs, data migrations, schema changes, seed scripts, and post-merge steps.
---

# Rule: Never auto-patch deployment or data-sync failures

**When any deployment, data sync, or production script fails:**

1. **STOP immediately** — do not continue with the remaining steps in the sequence.
2. **Do NOT attempt to diagnose and fix the failure on your own.** No reading the failing script, no "let me check what column is missing," no "I see the issue, let me patch it."
3. **Report the failure to the user** with:
   - The exact error message and line number
   - Which step/script failed
   - What (if anything) was already successfully applied before the failure
   - What is now partially done / in an inconsistent state
4. **Stand by for explicit instructions** — the user decides the fix strategy.

## Why this rule exists

Production data is high-risk. An "obvious" script fix can silently corrupt data, miss edge cases, or make assumptions that don't match the user's intent. The user is the only one who should authorize changes to prod sync scripts or retry logic after a failure.

## Examples of when this applies

- `post-merge.sh` or any of its sub-steps fail
- `cleanupProdOnlyRows.ts`, `cleanupProdOnlyJunctionRows.ts`, `dumpDevDataForProd.ts`, or `applyDataToProd.ts` fail
- Any psql error during a prod data sync
- Any schema migration or `drizzle-kit push` failure
- Any seed script that throws after partial inserts
- Any deployment healthcheck failure

## Counter-examples (normal dev work, not covered)

- Fixing a bug in the web app's React component — this is normal code work, not a prod data sync
- Running a typecheck and fixing the resulting type error — normal development
- Fixing a failing unit test — normal development
