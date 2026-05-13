import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
 * Auto-create vendor purchase orders (status='pending') for a customer order.
 *
 * Two kinds of POs are created:
 *   1. Product POs — every item with a productId+manufacturerId that does
 *      not yet have a vendor_order_id is grouped by the product's
 *      manufacturer. The matching items get vendor_order_id set.
 *   2. Fabric POs — every item where fabric_vendor_id is set and
 *      fabric_vendor_order_id is still NULL is grouped by fabric_vendor_id.
 *      The matching items get fabric_vendor_order_id set so the same line
 *      appears on the product PO (for the product) AND on the fabric PO
 *      (for the fabric only).
 *
 * Idempotent: only items missing the relevant *_vendor_order_id are
 * considered, so a second call won't create duplicate POs.
 *
 * Used by /checkout (online orders) and /admin/orders (staff orders) so a
 * PO exists in 'pending' the moment any order is placed; staff submits
 * each PO to the vendor manually later from the vendor-orders page.
 */
export async function autoGenerateVendorOrders(
  tx: Tx,
  orderId: number,
  userId: number | null,
  notes: string | null = null,
): Promise<AutoGenerateResult> {
  // ── Product POs ─────────────────────────────────────────────────────
  // Lock the candidate order_items rows for the duration of the txn so a
  // concurrent caller can't see the same NULL vendor_order_id rows and
  // double-create POs.
  const productCandidates = await tx
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
        // Skip lines fully fulfilled from store inventory — nothing to order
        sql`NOT (${orderItemsTable.useInventory} = true AND ${orderItemsTable.inventoryQtyUsed} >= ${orderItemsTable.quantity})`,
      ),
    )
    .for("update", { of: orderItemsTable });

  const productGroups = new Map<number, number[]>();
  let skipped = 0;
  for (const c of productCandidates) {
    if (c.manufacturerId == null) {
      skipped += 1;
      continue;
    }
    const arr = productGroups.get(c.manufacturerId) ?? [];
    arr.push(c.item.id);
    productGroups.set(c.manufacturerId, arr);
  }

  const createdVendorOrderIds: number[] = [];
  let assigned = 0;
  for (const [manufacturerId, itemIds] of productGroups) {
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

  // ── Fabric POs ──────────────────────────────────────────────────────
  // Items with an alternate fabric vendor that haven't been assigned to a
  // fabric PO yet. Same lock pattern. These rows may already have
  // vendor_order_id set (from the product PO above) — that's expected;
  // the fabric line is split out on its own PO in addition.
  const fabricCandidates = await tx
    .select()
    .from(orderItemsTable)
    .where(
      and(
        eq(orderItemsTable.orderId, orderId),
        isNull(orderItemsTable.fabricVendorOrderId),
      ),
    )
    .for("update");

  const fabricGroups = new Map<number, number[]>();
  for (const it of fabricCandidates) {
    if (it.fabricVendorId == null) continue;
    const arr = fabricGroups.get(it.fabricVendorId) ?? [];
    arr.push(it.id);
    fabricGroups.set(it.fabricVendorId, arr);
  }

  for (const [fabricVendorId, itemIds] of fabricGroups) {
    const number = await nextVendorOrderNumber(tx);
    const [vo] = await tx
      .insert(vendorOrdersTable)
      .values({
        vendorOrderNumber: number,
        customerOrderId: orderId,
        manufacturerId: fabricVendorId,
        status: "pending",
        // Tag the notes so staff can tell at a glance this PO is for
        // fabric only (no product). We don't add a kind column on
        // vendor_orders; the discriminator is which order_items column
        // points back here.
        notes:
          (notes ? notes + "\n\n" : "") +
          "[Fabric-only PO — alternate fabric vendor]",
        createdByUserId: userId,
      })
      .returning();
    if (!vo) continue;
    await tx
      .update(orderItemsTable)
      .set({ fabricVendorOrderId: vo.id })
      .where(inArray(orderItemsTable.id, itemIds));
    createdVendorOrderIds.push(vo.id);
  }

  return {
    createdVendorOrderIds,
    assignedItemCount: assigned,
    skippedItemCount: skipped,
  };
}
