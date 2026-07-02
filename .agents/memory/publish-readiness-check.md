---
name: Publish readiness check
description: What to do when the user says they're about to publish and need a readiness check
---

When the user signals they are about to publish (or asks if everything is ready to publish), run a full readiness audit before saying yes. Never assume work is deployment-ready just because a feature is "done" in dev.

**The checklist:**

1. **Identify the last publish commit** — ask or check the git log for the most recent deploy.
2. **List every task completed since that commit** — schema changes, new scripts, seed data, API changes, frontend changes.
3. **For each task, verify prod is in sync:**
   - Schema changes → confirm the column/table exists in prod (`executeSql` with `environment:"production"`).
   - New seed/loader scripts → confirm the data they produce is present in prod (row counts, key values).
   - Post-merge.sh → confirm every script that creates prod state is listed and has run.
   - API changes → spot-check the affected endpoints against prod.
4. **Cross-check key dev/prod counts** for the affected manufacturers/tables — active products, active variants, fabric_links, grade_prices, finishes, fabrics.
5. **Typecheck** (`pnpm run typecheck`) — must be clean.
6. **check-image-urls** workflow — must finish clean.
7. **Diff dev vs prod across ALL tables** — not just the changed ones. Compare row counts for every table; enumerate prod-only rows in transactional tables (orders, customers, vendor_orders, users) that a sync's TRUNCATE CASCADE would destroy. Flag EVERY difference to the user for a decision before pushing (pre-launch policy: dev overwrites prod, but the user decides on each difference).
8. **Report any mismatches before publishing**, not after.

**Why:** The Galtech/TG publish in June 2026 shipped with `fabrics.notes` missing from one SELECT (instant 500), TG rug products never seeded to prod, and TG umbrella fabric_links never cleaned up — all discovered only after publishing. A pre-publish audit against prod catches all of these.
