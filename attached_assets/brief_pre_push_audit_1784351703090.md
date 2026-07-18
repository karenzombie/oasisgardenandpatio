# Agent Brief: Pre-push audit (dev to prod)

## Goal
Before the single dev-to-prod deploy, confirm two things and report:
1. All intended dev-only work is present and staged in dev.
2. The sync will carry catalog data only and cannot move test orders or
   customers into prod.

Report findings with file paths and actual evidence. Make NO changes.

## Absolute rule (read first)
Do NOT modify, patch, or "fix" any sync script or anything else. This includes
`scripts/deploy-sync.sh`, `scripts/src/dumpDevDataForProd.ts`,
`scripts/src/applyDataToProd.ts`, `scripts/src/cleanupProdOnlyRows.ts`, and
`scripts/src/cleanupProdOnlyJunctionRows.ts`. If you find a problem, report it
and STOP. Do not run any sync against prod. A live patch to a sync script during
a deploy caused real damage last time. This audit is report-only.

If you cannot determine something, write "I could not determine this." Do not
guess. Check in after each step.

## Step 1: Confirm dev-only work is present in dev (report-only)
For each item, confirm it is present in dev and cite the file path or a
read-only dev query result. Do not change anything.

- Archive BCC: `sendViaResend` exists in `artifacts/api-server/src/lib/email.ts`
  and all outbound Resend send calls route through it (none left calling
  `client.emails.send` directly except inside `sendViaResend`).
- Payment visibility: customer payment badges, staff payment truthfulness, and
  admin held approve/decline are present in dev code (the shared payment-state
  helper and the surfaces that use it).
- Couture Jardin 500 fix: the by-slug product query supplies the manufacturer
  name on finish collections. Confirm the fix is in dev code AND that a Couture
  Jardin product page loads in dev without a 500.
- Data already applied in dev, confirm with read-only dev queries:
  `product_umbrella_sizes` populated, `rank_group` populated, taxonomy work done
  (the six empty categories deleted, Telescope bases moved out of Umbrellas,
  Chaise consolidated, Dining/Bar restructured, `sub_category` normalized).

Check in with this list before Step 2.

## Step 2: Confirm the sync scope (read-only, quote the code)
Confirm each of these by quoting the relevant lines:

- `deploy-sync.sh` runs, in order: `cleanupProdOnlyRows`,
  `cleanupProdOnlyJunctionRows`, `dumpDevDataForProd`, `applyDataToProd`.
- `dumpDevDataForProd.ts` `TABLES_IN_ORDER` contains catalog tables only and NO
  transactional tables: no orders, customers, carts, cart_items, wishlists,
  payments, vendor_orders, addresses, shipments.
- `applyDataToProd.ts` is upsert-only with no TRUNCATE.
- `cleanupProdOnlyRows.ts` and `cleanupProdOnlyJunctionRows.ts` delete only
  catalog and junction rows, never orders or customers.

Then state plainly: can this sync insert or move dev's test orders or customers
into prod? If anything contradicts a "no," report it and STOP.

## Step 3: Report
Short findings report. File paths and query results, not prose summaries. Flag
anything missing from Step 1 or any concern from Step 2, and STOP rather than
fix.
