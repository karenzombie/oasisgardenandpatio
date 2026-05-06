import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  orderItemsTable,
  productsTable,
  vendorOrdersTable,
} from "@workspace/db";
import { nextVendorOrderNumber } from "../routes/adminVendorOrders";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AutoGenerateResult {
  createdVendorOrderIds: number[];
  assignedItemCount: number;
  skippedItemCount: number;
}

/**
 * Auto-create vendor purchase orders (status='pending') for every unassigned
 * line item on the given customer order. Items are grouped by their product's
 * manufacturer; items without a productId or whose product has no
 * manufacturer are skipped (counted in skippedItemCount).
 *
 * Idempotent: only items where vendor_order_id IS NULL are considered, so a
 * second call won't create duplicate POs.
 *
 * Used by /checkout (online orders) and /admin/orders (staff orders) so a PO
 * exists in 'pending' the moment any order is placed; staff submits each PO
 * to the vendor manually later from the vendor-orders page.
 */
export async function autoGenerateVendorOrders(
  tx: Tx,
  orderId: number,
  userId: number | null,
  notes: string | null = null,
): Promise<AutoGenerateResult> {
  // Lock the candidate order_items rows for the duration of the txn so a
  // concurrent caller can't see the same NULL vendor_order_id rows and
  // double-create POs. Combined with the same-txn UPDATE that sets
  // vendor_order_id, this makes the helper safely idempotent under
  // parallel callers as well as sequential retries.
  const candidates = await tx
    .select({
      item: orderItemsTable,
      manufacturerId: productsTable.manufacturerId,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(
      and(
        eq(orderItemsTable.orderId, orderId),
        isNull(orderItemsTable.vendorOrderId),
      ),
    )
    .for("update", { of: orderItemsTable });

  const groups = new Map<number, number[]>();
  let skipped = 0;
  for (const c of candidates) {
    if (c.manufacturerId == null) {
      skipped += 1;
      continue;
    }
    const arr = groups.get(c.manufacturerId) ?? [];
    arr.push(c.item.id);
    groups.set(c.manufacturerId, arr);
  }

  const createdVendorOrderIds: number[] = [];
  let assigned = 0;
  for (const [manufacturerId, itemIds] of groups) {
    const number = await nextVendorOrderNumber(tx);
    const [vo] = await tx
      .insert(vendorOrdersTable)
      .values({
        vendorOrderNumber: number,
        customerOrderId: orderId,
        manufacturerId,
        status: "pending",
        notes,
        createdByUserId: userId,
      })
      .returning();
    if (!vo) continue;
    await tx
      .update(orderItemsTable)
      .set({ vendorOrderId: vo.id })
      .where(inArray(orderItemsTable.id, itemIds));
    createdVendorOrderIds.push(vo.id);
    assigned += itemIds.length;
  }

  return {
    createdVendorOrderIds,
    assignedItemCount: assigned,
    skippedItemCount: skipped,
  };
}
