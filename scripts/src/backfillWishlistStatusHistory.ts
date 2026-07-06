// Brief 07B, Step 5 — one-time backfill for wishlist status history.
//
// Two independent backfills:
//   1. Per-item companion rows (wishlist_outreach_log_items) for
//      wishlist_outreach_log entries written before per-item tracking
//      existed (Brief 07B Step 2A). An item "existed at the time of the
//      send" if its wishlist_items.created_at <= the log's sent_at.
//   2. item_added wishlist_status_history entries for existing
//      wishlist_items rows, using created_at as the event timestamp and a
//      null staff_user_id (customer-triggered). Only applies to items tied
//      to a customer (guest-only rows with customer_id null have no
//      wishlist row to attach history to — matches the live write path).
//
// Idempotent: safe to re-run. Skips outreach logs that already have any
// companion rows, and skips wishlist_items that already have a matching
// item_added history row (same wishlist_id + product_id + created_at).
//
// Defaults to a dry run (reports counts only). Pass --commit to write.
//
// Usage:
//   pnpm --filter @workspace/scripts exec tsx src/backfillWishlistStatusHistory.ts
//   pnpm --filter @workspace/scripts exec tsx src/backfillWishlistStatusHistory.ts --commit

import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  wishlistsTable,
  wishlistItemsTable,
  wishlistOutreachLogTable,
  wishlistOutreachLogItemsTable,
  wishlistStatusHistoryTable,
} from "@workspace/db";

const COMMIT = process.argv.includes("--commit");

async function findLogsMissingCompanionRows() {
  const logs = await db
    .select({
      id: wishlistOutreachLogTable.id,
      customerId: wishlistOutreachLogTable.customerId,
      sentAt: wishlistOutreachLogTable.sentAt,
    })
    .from(wishlistOutreachLogTable);

  const existingCounts = await db
    .select({
      outreachLogId: wishlistOutreachLogItemsTable.outreachLogId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(wishlistOutreachLogItemsTable)
    .groupBy(wishlistOutreachLogItemsTable.outreachLogId);

  const hasCompanionRows = new Set(
    existingCounts
      .filter((r) => Number(r.count) > 0)
      .map((r) => r.outreachLogId),
  );

  return logs.filter((l) => !hasCompanionRows.has(l.id));
}

async function planOutreachBackfill() {
  const logsMissing = await findLogsMissingCompanionRows();
  const plan: { outreachLogId: number; wishlistItemId: number }[] = [];

  for (const log of logsMissing) {
    const items = await db
      .select({ id: wishlistItemsTable.id })
      .from(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.customerId, log.customerId),
          lte(wishlistItemsTable.createdAt, log.sentAt),
        ),
      );
    for (const item of items) {
      plan.push({ outreachLogId: log.id, wishlistItemId: item.id });
    }
  }

  return { logsMissing, plan };
}

async function planItemAddedBackfill() {
  const items = await db
    .select({
      id: wishlistItemsTable.id,
      customerId: wishlistItemsTable.customerId,
      productId: wishlistItemsTable.productId,
      createdAt: wishlistItemsTable.createdAt,
    })
    .from(wishlistItemsTable)
    .where(sql`${wishlistItemsTable.customerId} is not null`);

  if (items.length === 0) return { skippedNoWishlist: 0, plan: [] as {
    wishlistId: number;
    productId: number;
    createdAt: Date;
  }[] };

  const customerIds = Array.from(
    new Set(items.map((i) => i.customerId as number)),
  );
  const wishlistRows = await db
    .select({ id: wishlistsTable.id, customerId: wishlistsTable.customerId })
    .from(wishlistsTable)
    .where(inArray(wishlistsTable.customerId, customerIds));
  const wishlistIdByCustomerId = new Map(
    wishlistRows.map((w) => [w.customerId, w.id]),
  );

  const existing = await db
    .select({
      wishlistId: wishlistStatusHistoryTable.wishlistId,
      productId: wishlistStatusHistoryTable.productId,
      createdAt: wishlistStatusHistoryTable.createdAt,
    })
    .from(wishlistStatusHistoryTable)
    .where(eq(wishlistStatusHistoryTable.eventType, "item_added"));
  const existingKeys = new Set(
    existing.map(
      (e) => `${e.wishlistId}:${e.productId}:${e.createdAt.toISOString()}`,
    ),
  );

  let skippedNoWishlist = 0;
  const plan: { wishlistId: number; productId: number; createdAt: Date }[] =
    [];

  for (const item of items) {
    const wishlistId = wishlistIdByCustomerId.get(item.customerId as number);
    if (!wishlistId) {
      skippedNoWishlist++;
      continue;
    }
    const key = `${wishlistId}:${item.productId}:${item.createdAt.toISOString()}`;
    if (existingKeys.has(key)) continue;
    plan.push({ wishlistId, productId: item.productId, createdAt: item.createdAt });
  }

  return { skippedNoWishlist, plan };
}

async function main() {
  const outreach = await planOutreachBackfill();
  const itemAdded = await planItemAddedBackfill();

  console.log("=== Wishlist status history backfill ===");
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}`);
  console.log("");
  console.log("-- Per-item outreach companion rows --");
  console.log(
    `Outreach logs missing companion rows: ${outreach.logsMissing.length}`,
  );
  for (const log of outreach.logsMissing) {
    const rowsForLog = outreach.plan.filter(
      (p) => p.outreachLogId === log.id,
    ).length;
    console.log(
      `  log #${log.id} (customer ${log.customerId}, sent ${log.sentAt.toISOString()}): ${rowsForLog} companion row(s) to create`,
    );
  }
  console.log(
    `Total wishlist_outreach_log_items rows to insert: ${outreach.plan.length}`,
  );
  console.log("");
  console.log("-- item_added status history --");
  console.log(
    `wishlist_items with no wishlist row (skipped): ${itemAdded.skippedNoWishlist}`,
  );
  console.log(
    `Total wishlist_status_history (item_added) rows to insert: ${itemAdded.plan.length}`,
  );

  if (!COMMIT) {
    console.log("");
    console.log("Dry run only — no rows written. Re-run with --commit to apply.");
    process.exit(0);
  }

  if (outreach.plan.length > 0) {
    await db.insert(wishlistOutreachLogItemsTable).values(outreach.plan);
  }
  if (itemAdded.plan.length > 0) {
    await db.insert(wishlistStatusHistoryTable).values(
      itemAdded.plan.map((p) => ({
        wishlistId: p.wishlistId,
        eventType: "item_added",
        productId: p.productId,
        staffUserId: null,
        createdAt: p.createdAt,
      })),
    );
  }

  console.log("");
  console.log(
    `Committed: ${outreach.plan.length} outreach companion row(s), ${itemAdded.plan.length} item_added history row(s).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
