import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  vendorOrdersTable,
  vendorOrderSendsTable,
  vendorOrderEditsTable,
  vendorOrderCancellationsTable,
  vendorOrderReceivesTable,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  manufacturersTable,
  productsTable,
  customersTable,
  usersTable,
  addressesTable,
  inventoryReceiptsTable,
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
  inventoryTable,
  entityHistoryTable,
  resolveLineCost,
  type VendorOrder,
  type OrderItem,
} from "@workspace/db";
import {
  AdminListVendorOrdersQueryParams,
  AdminGetVendorOrderParams,
  AdminUpdateVendorOrderParams,
  AdminUpdateVendorOrderBody,
  AdminDeleteVendorOrderParams,
  AdminGenerateVendorOrdersParams,
  AdminGenerateVendorOrdersBody,
  AdminSendVendorOrderParams,
  AdminSendVendorOrderBody,
  AdminUpdateVendorOrderStatusParams,
  AdminUpdateVendorOrderStatusBody,
  AdminReceiveVendorOrderParams,
  AdminReceiveVendorOrderBody,
  AdminCancelVendorOrderParams,
  AdminCancelVendorOrderBody,
  AdminCancelPendingVendorOrderParams,
  AdminCancelPendingVendorOrderBody,
  AdminEditVendorOrderParams,
  AdminEditVendorOrderBody,
  AdminCreateStandaloneVendorOrderBody,
} from "@workspace/api-zod";
import { productVariantsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import {
  sendVendorOrderEmail,
  sendVendorOrderCancellationEmail,
  sendVendorOrderRevisionEmail,
} from "../lib/vendorOrderEmail";
import {
  generateVendorOrderPdf,
  generateVendorOrderCancellationPdf,
  type PdfVendorOrderItem,
} from "../lib/vendorOrderPdf";
import { uploadBufferToStorage } from "../lib/objectStorage";
import { toPublicImageUrl } from "../lib/imageUrl";
import { autoGenerateVendorOrders } from "../lib/autoGenerateVendorOrders";

const router: IRouter = Router();
const DEFAULT_LIMIT = 50;

// Vendor order status machine:
//   pending -> sent -> acknowledged -> fulfilled -> received (terminal)
//   any non-received -> canceled (terminal)
// /status only handles acknowledged + fulfilled. Sending is via /send,
// receiving via /receive, and cancellation via /cancel — each has bespoke
// side effects (timestamps, sends row, inventory_receipts, item un-assign).
const ALLOWED_STATUS_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["sent", "canceled"]),
  sent: new Set(["acknowledged", "fulfilled", "received", "canceled"]),
  acknowledged: new Set(["fulfilled", "received", "canceled"]),
  fulfilled: new Set(["received", "canceled"]),
  received: new Set(),
  canceled: new Set(),
};
const TERMINAL_STATUSES = new Set(["received", "canceled"]);

function nameOf(first: string | null, last: string | null): string | null {
  const v = [first, last].filter(Boolean).join(" ").trim();
  return v.length === 0 ? null : v;
}

// `kind` is the discriminator between a regular product line on the
// product vendor's PO ('product') and a fabric-only line that was split out
// to an alternate fabric vendor's PO ('fabric'). For fabric lines the unit
// price/amount are zeroed in the payload (the cost lives on the customer
// order, not on the fabric PO line) and the fabric snapshot fields are
// what the vendor renders.
function itemToPayload(
  it: OrderItem,
  kind: "product" | "fabric" = "product",
  cost: number | null = null,
  addons: Array<{ sku: string | null; name: string; quantity: number }> = [],
) {
  // Effective (PO-facing) values: a PO edit layers po_* overrides on top of
  // the shared customer row (see the overlay note in the orders schema).
  // The vendor PO and staff UI read `po_x ?? x`; the customer order keeps
  // reading the untouched originals.
  const effQuantity = it.poQuantity ?? it.quantity;
  const effUnitRaw = it.poUnitPrice ?? it.unitPrice;
  const effSku =
    it.poSku ?? it.variantSkuSnapshot ?? it.productSkuSnapshot ?? null;
  const effDescription = it.poDescription ?? it.description;
  const effSubDescription = it.poSubDescription ?? it.variantNameSnapshot ?? null;
  return {
    id: it.id,
    productId: it.productId,
    productSkuSnapshot: it.productSkuSnapshot,
    variantSkuSnapshot: it.variantSkuSnapshot,
    variantNameSnapshot: it.variantNameSnapshot,
    weightSnapshot: it.weightSnapshot,
    finishCodeSnapshot: it.finishCodeSnapshot,
    finishNameSnapshot: it.finishNameSnapshot,
    finialCodeSnapshot: it.finialCodeSnapshot,
    finialNameSnapshot: it.finialNameSnapshot,
    fabricItemNumberSnapshot: it.fabricItemNumberSnapshot,
    fabricNameSnapshot: it.fabricNameSnapshot,
    fabricBrandSnapshot: it.fabricBrandSnapshot,
    fabricGradeSnapshot: it.fabricGradeSnapshot,
    description: effDescription,
    quantity: effQuantity,
    receivedQuantity: it.receivedQuantity,
    unitPrice: kind === "fabric" ? 0 : Number(effUnitRaw),
    amount: kind === "fabric" ? 0 : Number(effUnitRaw) * effQuantity,
    notes: it.notes,
    sku: effSku,
    subDescription: effSubDescription,
    cost,
    edited: it.poEdited,
    kind,
    // Add-on snapshots (e.g. Marella privacy walls) ordered from the vendor
    // alongside the parent line. Rendered as SKU/name/qty sub-lines on the
    // PO PDF and email — NEVER with pricing (hard client rule).
    addons,
  };
}

// VO numbers share the customer-order numbering style: VO-YYYY-NNNNN, scoped by year.
// We take a transaction-scoped advisory lock keyed on (a constant tag, year) so
// concurrent generate calls serialize through the SELECT max + INSERT without
// risking duplicate numbers.
const VO_NUMBER_LOCK_TAG = 0x564f; // 'VO'
export async function nextVendorOrderNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  const year = new Date().getUTCFullYear();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${VO_NUMBER_LOCK_TAG}, ${year})`);
  const prefix = `VO-${year}-`;
  const [row] = await tx
    .select({
      max: sql<string | null>`max(${vendorOrdersTable.vendorOrderNumber})`,
    })
    .from(vendorOrdersTable)
    .where(ilike(vendorOrdersTable.vendorOrderNumber, `${prefix}%`));
  const last = row?.max ?? null;
  let next = 1;
  if (last) {
    const m = last.match(/^VO-\d{4}-(\d+)$/);
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// POST /admin/vendor-orders — create a standalone vendor order (no parent
// customer order). Line items are inserted directly with orderId=NULL and
// vendorOrderId pointing at the new VO. Snapshots are captured from the
// product/variant rows so later renames don't rewrite history.
// ---------------------------------------------------------------------------
router.post(
  "/admin/vendor-orders",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateStandaloneVendorOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    // Validate manufacturer exists.
    const [mfg] = await db
      .select()
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, body.manufacturerId));
    if (!mfg) {
      res.status(404).json({ error: "Manufacturer not found" });
      return;
    }

    // Validate drop-ship address: when shipToStore=false, at least
    // line1/city/state/postalCode must be present so the vendor knows
    // where to deliver.
    if (!body.shipToStore) {
      if (!body.shipToLine1 || !body.shipToCity || !body.shipToState || !body.shipToPostalCode) {
        res.status(400).json({
          error: "Drop-ship address requires line1, city, state and postal code",
        });
        return;
      }
    }

    // Pre-fetch products + variants in bulk so we have snapshots and can
    // verify every referenced row exists before opening the txn.
    const productIds = Array.from(new Set(body.items.map((i) => i.productId)));
    const variantIds = Array.from(
      new Set(body.items.map((i) => i.variantId).filter((x): x is number => x != null)),
    );
    const products = await db
      .select()
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));
    const productById = new Map(products.map((p) => [p.id, p]));
    for (const pid of productIds) {
      const p = productById.get(pid);
      if (!p) {
        res.status(404).json({ error: `Product ${pid} not found` });
        return;
      }
      // Enforce single-vendor PO semantics: every product on the PO must
      // be made by the selected manufacturer. Otherwise the PO would
      // email the wrong vendor and corrupt downstream accountability.
      if (p.manufacturerId !== body.manufacturerId) {
        res.status(400).json({
          error: `Product ${p.sku} is made by a different manufacturer than the selected vendor`,
        });
        return;
      }
    }
    const variants = variantIds.length
      ? await db
          .select()
          .from(productVariantsTable)
          .where(inArray(productVariantsTable.id, variantIds))
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));
    for (const item of body.items) {
      if (item.variantId != null) {
        const v = variantById.get(item.variantId);
        if (!v) {
          res.status(404).json({ error: `Variant ${item.variantId} not found` });
          return;
        }
        if (v.productId !== item.productId) {
          res.status(400).json({
            error: `Variant ${item.variantId} does not belong to product ${item.productId}`,
          });
          return;
        }
      }
    }

    const userId = (req as Request & { user?: { id: number } }).user?.id ?? null;

    // Resolve unit cost snapshots before opening the transaction (read-only).
    // Priority: item.grade → String(item.finishId) → null (no grade supplied).
    const costSnapshots: (string | null)[] = [];
    for (const item of body.items) {
      const derivedGrade =
        item.grade != null
          ? item.grade
          : item.finishId != null
            ? String(item.finishId)
            : null;
      const cost = await resolveLineCost(db, {
        productId: item.productId,
        variantId: item.variantId ?? null,
        grade: derivedGrade,
      });
      costSnapshots.push(cost != null ? String(cost) : null);
    }

    const created = await db.transaction(async (tx) => {
      const number = await nextVendorOrderNumber(tx);
      const [vo] = await tx
        .insert(vendorOrdersTable)
        .values({
          vendorOrderNumber: number,
          customerOrderId: null,
          manufacturerId: body.manufacturerId,
          status: "pending",
          notes: body.notes ?? null,
          noteToVendor: body.noteToVendor ?? null,
          vendorEstimatedDeliveryDate: body.vendorEstimatedDeliveryDate
            ? new Date(body.vendorEstimatedDeliveryDate)
            : null,
          shipToStoreOverride: body.shipToStore,
          shipToName: body.shipToStore ? null : (body.shipToName ?? null),
          shipToLine1: body.shipToStore ? null : (body.shipToLine1 ?? null),
          shipToLine2: body.shipToStore ? null : (body.shipToLine2 ?? null),
          shipToCity: body.shipToStore ? null : (body.shipToCity ?? null),
          shipToState: body.shipToStore ? null : (body.shipToState ?? null),
          shipToPostalCode: body.shipToStore ? null : (body.shipToPostalCode ?? null),
          shipToPhone: body.shipToStore ? null : (body.shipToPhone ?? null),
          createdByUserId: userId,
        })
        .returning();
      if (!vo) throw new Error("Failed to insert vendor order");

      // Insert line items. orderId is NULL (standalone PO);
      // vendorOrderId points at the new VO. We capture description as
      // "Product Name" or "Product Name — Variant Name" and snapshot
      // SKUs so the PDF and detail page survive future product edits.
      // unitCostSnapshot is frozen from the resolver above; pre-existing
      // lines (created before this field existed) remain null.
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]!;
        const p = productById.get(item.productId)!;
        const v = item.variantId != null ? variantById.get(item.variantId) ?? null : null;
        const description = v ? `${p.name} — ${v.variantName}` : p.name;
        const unitPrice = item.unitPrice.toFixed(2);
        const amount = (item.unitPrice * item.quantity).toFixed(2);
        await tx.insert(orderItemsTable).values({
          orderId: null,
          vendorOrderId: vo.id,
          productId: p.id,
          variantId: v?.id ?? null,
          productSkuSnapshot: p.sku,
          variantSkuSnapshot: v?.variantSku ?? null,
          variantNameSnapshot: v?.variantName ?? null,
          weightSnapshot:
            v?.weight != null
              ? String(v.weight)
              : p.weight != null
                ? String(p.weight)
                : null,
          description,
          quantity: item.quantity,
          unitPrice,
          amount,
          notes: item.notes ?? null,
          unitCostSnapshot: costSnapshots[i] ?? null,
        });
      }

      return vo;
    });

    await recordAudit(req, {
      action: "vendor_order.create_standalone",
      entityType: "vendor_order",
      entityId: created.id,
      changes: {
        vendorOrderNumber: created.vendorOrderNumber,
        manufacturerId: body.manufacturerId,
        itemCount: body.items.length,
      },
    });

    const detail = await loadVendorOrderDetail(created.id);
    if (!detail) {
      res.status(500).json({ error: "Failed to load created vendor order" });
      return;
    }
    res.status(201).json(detail);
  },
);

router.get(
  "/admin/vendor-orders",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListVendorOrdersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { bucket, status, manufacturerId, customerOrderId, q, limit, offset } =
      parsed.data;
    const conditions: Array<ReturnType<typeof eq>> = [];
    if (status) conditions.push(eq(vendorOrdersTable.status, status));
    if (manufacturerId !== undefined)
      conditions.push(eq(vendorOrdersTable.manufacturerId, manufacturerId));
    if (customerOrderId !== undefined)
      conditions.push(eq(vendorOrdersTable.customerOrderId, customerOrderId));
    if (bucket === "needs_action") {
      conditions.push(eq(vendorOrdersTable.status, "pending"));
    } else if (bucket === "sent") {
      conditions.push(sql`${vendorOrdersTable.status} <> 'pending'`);
    }
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(vendorOrdersTable.vendorOrderNumber, needle),
        ilike(ordersTable.orderNumber, needle),
      );
      if (orExpr) conditions.push(orExpr);
    }
    const whereExpr = conditions.length ? and(...conditions) : undefined;
    const cap = Math.min(limit ?? DEFAULT_LIMIT, 200);
    const off = offset ?? 0;

    const rows = await db
      .select({
        vo: vendorOrdersTable,
        mfg: manufacturersTable,
        order: ordersTable,
        itemCount: sql<number>`(
          SELECT count(*)::int
          FROM ${orderItemsTable}
          WHERE ${orderItemsTable.vendorOrderId} = ${vendorOrdersTable.id}
             OR ${orderItemsTable.fabricVendorOrderId} = ${vendorOrdersTable.id}
        )`,
      })
      .from(vendorOrdersTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
      )
      .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
      .where(whereExpr)
      .orderBy(desc(vendorOrdersTable.createdAt))
      .limit(cap)
      .offset(off);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorOrdersTable)
      .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
      .where(whereExpr);

    res.json({
      rows: rows.map((r) => ({
        id: r.vo.id,
        vendorOrderNumber: r.vo.vendorOrderNumber,
        status: r.vo.status,
        manufacturerId: r.vo.manufacturerId,
        manufacturerName: r.mfg?.name ?? null,
        customerOrderId: r.vo.customerOrderId,
        customerOrderNumber: r.order?.orderNumber ?? null,
        notes: r.vo.notes,
        vendorEstimatedDeliveryDate: r.vo.vendorEstimatedDeliveryDate
          ? r.vo.vendorEstimatedDeliveryDate.toISOString()
          : null,
        sentAt: r.vo.sentAt ? r.vo.sentAt.toISOString() : null,
        acknowledgedAt: r.vo.acknowledgedAt
          ? r.vo.acknowledgedAt.toISOString()
          : null,
        fulfilledAt: r.vo.fulfilledAt ? r.vo.fulfilledAt.toISOString() : null,
        receivedAt: r.vo.receivedAt ? r.vo.receivedAt.toISOString() : null,
        itemsReceived: r.vo.itemsReceived,
        itemCount: r.itemCount,
        createdAt: r.vo.createdAt.toISOString(),
      })),
      total: countRow?.count ?? 0,
    });
  },
);

async function loadVendorOrderDetail(id: number) {
  const [row] = await db
    .select({
      vo: vendorOrdersTable,
      mfg: manufacturersTable,
      order: ordersTable,
      customer: customersTable,
      creator: usersTable,
      shipAddr: addressesTable,
    })
    .from(vendorOrdersTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
    )
    .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(usersTable, eq(usersTable.id, vendorOrdersTable.createdByUserId))
    .leftJoin(addressesTable, eq(addressesTable.id, ordersTable.shippingAddressId))
    .where(eq(vendorOrdersTable.id, id))
    .limit(1);
  if (!row) return null;
  const { vo, mfg, order, customer, creator, shipAddr } = row;

  // Items on this PO come from two columns: vendor_order_id (regular
  // product lines) and fabric_vendor_order_id (fabric-only lines split
  // out to an alternate fabric vendor). Tag each row so the payload
  // mapping can render them correctly.
  // po_removed lines were dropped from this PO during an edit; they remain on
  // the customer order but must not appear on the vendor PO (UI, PDF, email).
  const productItems = await db
    .select()
    .from(orderItemsTable)
    .where(
      and(
        eq(orderItemsTable.vendorOrderId, id),
        eq(orderItemsTable.poRemoved, false),
      ),
    )
    .orderBy(asc(orderItemsTable.id));
  const fabricItems = await db
    .select()
    .from(orderItemsTable)
    .where(
      and(
        eq(orderItemsTable.fabricVendorOrderId, id),
        eq(orderItemsTable.poRemoved, false),
      ),
    )
    .orderBy(asc(orderItemsTable.id));
  const items: Array<{ row: OrderItem; kind: "product" | "fabric" }> = [
    ...productItems.map((row) => ({ row, kind: "product" as const })),
    ...fabricItems.map((row) => ({ row, kind: "fabric" as const })),
  ];

  // Add-on snapshots (e.g. Marella privacy walls) ride along with the parent
  // product line and must be ordered from the same vendor, so they appear as
  // sub-lines under the parent on the PO. Fabric-only PO lines never carry
  // add-ons (the add-on ships with the product vendor's PO).
  const addonsByOrderItem = new Map<
    number,
    Array<{ sku: string | null; name: string; quantity: number }>
  >();
  if (productItems.length) {
    const addonRows = await db
      .select({
        orderItemId: orderItemAddonsTable.orderItemId,
        sku: orderItemAddonsTable.addonSkuSnapshot,
        name: orderItemAddonsTable.addonNameSnapshot,
        quantity: orderItemAddonsTable.quantity,
      })
      .from(orderItemAddonsTable)
      .where(
        inArray(
          orderItemAddonsTable.orderItemId,
          productItems.map((r) => r.id),
        ),
      )
      .orderBy(asc(orderItemAddonsTable.id));
    for (const a of addonRows) {
      const list = addonsByOrderItem.get(a.orderItemId) ?? [];
      list.push({ sku: a.sku, name: a.name, quantity: a.quantity });
      addonsByOrderItem.set(a.orderItemId, list);
    }
  }

  // Per-unit cost is pulled LIVE from the product record (products.cost). It is
  // staff-only (shown in the UI to help hit vendor order minimums) and is never
  // printed/emailed on the PO. Batch-resolve by productId, falling back to a
  // SKU match for added lines that have no productId.
  const costProductIds = Array.from(
    new Set(
      items
        .map((x) => x.row.productId)
        .filter((v): v is number => v != null),
    ),
  );
  const costSkus = Array.from(
    new Set(
      items
        .filter((x) => x.row.productId == null)
        .map(
          (x) =>
            x.row.poSku ??
            x.row.variantSkuSnapshot ??
            x.row.productSkuSnapshot ??
            null,
        )
        .filter((v): v is string => v != null && v.length > 0),
    ),
  );
  const costByProductId = new Map<number, string | null>();
  if (costProductIds.length) {
    const rows = await db
      .select({ id: productsTable.id, cost: productsTable.cost })
      .from(productsTable)
      .where(inArray(productsTable.id, costProductIds));
    rows.forEach((r) => costByProductId.set(r.id, r.cost));
  }
  const costBySku = new Map<string, string | null>();
  if (costSkus.length) {
    const rows = await db
      .select({ sku: productsTable.sku, cost: productsTable.cost })
      .from(productsTable)
      .where(inArray(productsTable.sku, costSkus));
    rows.forEach((r) => costBySku.set(r.sku, r.cost));
  }
  const resolveCost = (row: OrderItem): number | null => {
    let raw: string | null | undefined = null;
    if (row.productId != null) {
      raw = costByProductId.get(row.productId) ?? null;
    } else {
      const sku =
        row.poSku ?? row.variantSkuSnapshot ?? row.productSkuSnapshot ?? null;
      if (sku) raw = costBySku.get(sku) ?? null;
    }
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const receives = await db
    .select({ r: vendorOrderReceivesTable, receiver: usersTable })
    .from(vendorOrderReceivesTable)
    .leftJoin(usersTable, eq(usersTable.id, vendorOrderReceivesTable.receivedByUserId))
    .where(eq(vendorOrderReceivesTable.vendorOrderId, id))
    .orderBy(desc(vendorOrderReceivesTable.receivedAt));

  const edits = await db
    .select({ e: vendorOrderEditsTable, editor: usersTable })
    .from(vendorOrderEditsTable)
    .leftJoin(usersTable, eq(usersTable.id, vendorOrderEditsTable.editedByUserId))
    .where(eq(vendorOrderEditsTable.vendorOrderId, id))
    .orderBy(desc(vendorOrderEditsTable.editedAt));

  const sends = await db
    .select({ s: vendorOrderSendsTable, sender: usersTable })
    .from(vendorOrderSendsTable)
    .leftJoin(usersTable, eq(usersTable.id, vendorOrderSendsTable.sentByUserId))
    .where(eq(vendorOrderSendsTable.vendorOrderId, id))
    .orderBy(desc(vendorOrderSendsTable.sentAt));

  const statusChangeHistory = await db
    .select({ h: entityHistoryTable, actor: usersTable })
    .from(entityHistoryTable)
    .leftJoin(usersTable, eq(usersTable.id, entityHistoryTable.changedByUserId))
    .where(
      and(
        eq(entityHistoryTable.entityType, "vendor_order"),
        eq(entityHistoryTable.entityId, id),
        ilike(entityHistoryTable.notes, "status →%"),
      ),
    )
    .orderBy(desc(entityHistoryTable.createdAt));

  const cancellations = await db
    .select({ c: vendorOrderCancellationsTable, canceller: usersTable })
    .from(vendorOrderCancellationsTable)
    .leftJoin(
      usersTable,
      eq(usersTable.id, vendorOrderCancellationsTable.cancelledByUserId),
    )
    .where(eq(vendorOrderCancellationsTable.vendorOrderId, id))
    .orderBy(desc(vendorOrderCancellationsTable.cancelledAt));

  const [receiver] = vo.receivedByUserId
    ? await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, vo.receivedByUserId))
        .limit(1)
    : [];

  return {
    id: vo.id,
    vendorOrderNumber: vo.vendorOrderNumber,
    status: vo.status,
    notes: vo.notes,
    noteToVendor: vo.noteToVendor,
    vendorEstimatedDeliveryDate: vo.vendorEstimatedDeliveryDate
      ? vo.vendorEstimatedDeliveryDate.toISOString()
      : null,
    sentAt: vo.sentAt ? vo.sentAt.toISOString() : null,
    acknowledgedAt: vo.acknowledgedAt
      ? vo.acknowledgedAt.toISOString()
      : null,
    fulfilledAt: vo.fulfilledAt ? vo.fulfilledAt.toISOString() : null,
    receivedAt: vo.receivedAt ? vo.receivedAt.toISOString() : null,
    receivedByUserId: vo.receivedByUserId,
    receivedByEmail: receiver?.email ?? null,
    itemsReceived: vo.itemsReceived,
    createdByUserId: vo.createdByUserId,
    createdByEmail: creator?.email ?? null,
    createdAt: vo.createdAt.toISOString(),
    updatedAt: vo.updatedAt.toISOString(),
    manufacturerId: vo.manufacturerId,
    manufacturerName: mfg?.name ?? null,
    manufacturerOrderEmail: mfg?.orderEmail ?? null,
    manufacturerAddressLine1: mfg?.addressLine1 ?? null,
    manufacturerAddressLine2: mfg?.addressLine2 ?? null,
    manufacturerCity: mfg?.city ?? null,
    manufacturerState: mfg?.state ?? null,
    manufacturerPostalCode: mfg?.postalCode ?? null,
    manufacturerPhone: mfg?.phone ?? null,
    manufacturerFax: mfg?.fax ?? null,
    customerOrderId: vo.customerOrderId,
    customerOrderNumber: order?.orderNumber ?? null,
    customerOrderStatus: order?.status ?? null,
    // Customer name for the PO header. For walk-in / quick orders there's no
    // customers row, so fall back to the order's walkInName so the vendor
    // can still see who the items are for.
    customerName: customer
      ? nameOf(customer.firstName, customer.lastName)
      : (order?.walkInName ?? null),
    // Ship-to resolution order: (1) VO's own override fields when set
    // (used for standalone POs, and as an explicit override on
    // customer-order POs); (2) the customer order's resolved shipping
    // address when shipToStore is false; (3) default ship-to-store.
    ...(() => {
      // Consider ALL override fields so a partially-populated row still
      // counts as an explicit override and we don't silently fall back
      // to the parent customer order's address.
      const hasOverride =
        vo.shipToStoreOverride !== null ||
        vo.shipToName != null ||
        vo.shipToLine1 != null ||
        vo.shipToLine2 != null ||
        vo.shipToCity != null ||
        vo.shipToState != null ||
        vo.shipToPostalCode != null ||
        vo.shipToPhone != null;
      const shipToStore = hasOverride
        ? vo.shipToStoreOverride !== false
        : (order?.shipToStore ?? true);
      if (hasOverride) {
        return {
          shipToStore,
          shipToName: vo.shipToName,
          shipToLine1: vo.shipToLine1,
          shipToLine2: vo.shipToLine2,
          shipToCity: vo.shipToCity,
          shipToState: vo.shipToState,
          shipToPostalCode: vo.shipToPostalCode,
          shipToPhone: vo.shipToPhone,
        };
      }
      return {
        shipToStore,
        shipToName: shipAddr
          ? (shipAddr.recipientName ||
            (customer ? nameOf(customer.firstName, customer.lastName) : null) ||
            order?.walkInName ||
            null)
          : null,
        shipToLine1: shipAddr?.street1 ?? null,
        shipToLine2: shipAddr?.street2 ?? null,
        shipToCity: shipAddr?.city ?? null,
        shipToState: shipAddr?.state ?? null,
        shipToPostalCode: shipAddr?.zip ?? null,
        shipToPhone: shipAddr?.phone ?? null,
      };
    })(),
    items: items.map((x) =>
      itemToPayload(
        x.row,
        x.kind,
        resolveCost(x.row),
        x.kind === "product" ? (addonsByOrderItem.get(x.row.id) ?? []) : [],
      ),
    ),
    sends: sends.map((row) => ({
      id: row.s.id,
      sentByUserId: row.s.sentByUserId,
      sentByEmail: row.sender?.email ?? null,
      sentAt: row.s.sentAt.toISOString(),
      sentToEmail: row.s.sentToEmail,
      isResend: row.s.isResend,
      resendNote: row.s.resendNote,
      correctionNote: row.s.correctionNote,
      pdfStorageUrl: toPublicImageUrl(row.s.pdfStorageUrl),
    })),
    edits: edits.map((row) => ({
      id: row.e.id,
      editedByUserId: row.e.editedByUserId,
      editedByEmail: row.editor?.email ?? null,
      editedAt: row.e.editedAt.toISOString(),
      note: row.e.note,
    })),
    statusChanges: statusChangeHistory.map((row) => ({
      id: row.h.id,
      changedByUserId: row.h.changedByUserId,
      changedByEmail: row.h.changedByEmail ?? row.actor?.email ?? null,
      changedAt: row.h.createdAt.toISOString(),
      note: row.h.notes,
    })),
    cancellations: cancellations.map((row) => ({
      id: row.c.id,
      scope: row.c.scope as "full" | "partial",
      reason: row.c.reason,
      cancelledByUserId: row.c.cancelledByUserId,
      cancelledByEmail: row.canceller?.email ?? null,
      cancelledAt: row.c.cancelledAt.toISOString(),
      pdfStorageUrl: toPublicImageUrl(row.c.pdfStorageUrl),
      emailedAt: row.c.emailedAt ? row.c.emailedAt.toISOString() : null,
      emailedTo: row.c.emailedTo,
      itemCount: Array.isArray(row.c.items) ? row.c.items.length : 0,
    })),
    receives: receives.map((row) => ({
      id: row.r.id,
      receivedByUserId: row.r.receivedByUserId,
      receivedByEmail: row.receiver?.email ?? null,
      receivedAt: row.r.receivedAt.toISOString(),
      notes: row.r.notes,
      items: Array.isArray(row.r.items) ? row.r.items : [],
    })),
  };
}

router.get(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.get(
  "/admin/vendor-orders/:id/pdf",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateVendorOrderPdf({
        vendorOrderNumber: detail.vendorOrderNumber,
        dateOrdered: detail.createdAt,
        customerOrderNumber: detail.customerOrderNumber,
        customerName: detail.customerName,
        notes: detail.notes,
        noteToVendor: detail.noteToVendor,
        items: detail.items,
        manufacturerName: detail.manufacturerName,
        manufacturerAddressLine1: detail.manufacturerAddressLine1,
        manufacturerAddressLine2: detail.manufacturerAddressLine2,
        manufacturerCity: detail.manufacturerCity,
        manufacturerState: detail.manufacturerState,
        manufacturerPostalCode: detail.manufacturerPostalCode,
        manufacturerPhone: detail.manufacturerPhone,
        manufacturerFax: detail.manufacturerFax,
        manufacturerEmail: detail.manufacturerOrderEmail,
        shipToStore: detail.shipToStore,
        shipToName: detail.shipToName,
        shipToLine1: detail.shipToLine1,
        shipToLine2: detail.shipToLine2,
        shipToCity: detail.shipToCity,
        shipToState: detail.shipToState,
        shipToPostalCode: detail.shipToPostalCode,
        shipToPhone: detail.shipToPhone,
      });
    } catch (err) {
      req.log.error({ err, vendorOrderId: params.data.id }, "PDF generation failed");
      res.status(500).json({ error: "PDF generation failed" });
      return;
    }
    const filename = `${detail.vendorOrderNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  },
);

router.patch(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateVendorOrderBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    // Pending POs must be edited through the audited edit flow so every change
    // carries a mandatory change note; block the quick-save path for them.
    const [current] = await db
      .select({ status: vendorOrdersTable.status })
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (current.status === "pending") {
      res.status(409).json({
        error:
          "Pending vendor orders must be edited through the edit flow so changes are logged with a note.",
      });
      return;
    }
    const updates: Partial<VendorOrder> = {};
    if (body.data.notes !== undefined)
      updates.notes = body.data.notes ?? null;
    if (body.data.noteToVendor !== undefined)
      updates.noteToVendor = body.data.noteToVendor ?? null;
    if (body.data.vendorEstimatedDeliveryDate !== undefined) {
      updates.vendorEstimatedDeliveryDate = body.data.vendorEstimatedDeliveryDate
        ? new Date(body.data.vendorEstimatedDeliveryDate)
        : null;
    }
    if (Object.keys(updates).length === 0) {
      const detail = await loadVendorOrderDetail(params.data.id);
      if (!detail) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(detail);
      return;
    }
    const [row] = await db
      .update(vendorOrdersTable)
      .set(updates)
      .where(eq(vendorOrdersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.update",
      entityType: "vendor_order",
      entityId: row.id,
      changes: updates,
    });
    await recordHistory(req, {
      entityType: "vendor_order",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
    });
    const detail = await loadVendorOrderDetail(row.id);
    res.json(detail);
  },
);

router.delete(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "pending") {
        return { kind: "not_pending" as const, status: existing.status };
      }
      // Standalone POs (no customer order) own their line items outright,
      // so we DELETE them — un-assigning would leave orphan rows with both
      // orderId and vendorOrderId NULL. Customer-order POs un-assign as
      // before so the lines stay live on the customer order.
      let unassigned: Array<{ id: number }> = [];
      if (existing.customerOrderId == null) {
        const deletedProduct = await tx
          .delete(orderItemsTable)
          .where(eq(orderItemsTable.vendorOrderId, existing.id))
          .returning({ id: orderItemsTable.id });
        const deletedFabric = await tx
          .delete(orderItemsTable)
          .where(eq(orderItemsTable.fabricVendorOrderId, existing.id))
          .returning({ id: orderItemsTable.id });
        unassigned = [...deletedProduct, ...deletedFabric];
      } else {
        const unassignedProduct = await tx
          .update(orderItemsTable)
          .set({ vendorOrderId: null })
          .where(eq(orderItemsTable.vendorOrderId, existing.id))
          .returning({ id: orderItemsTable.id });
        const unassignedFabric = await tx
          .update(orderItemsTable)
          .set({ fabricVendorOrderId: null })
          .where(eq(orderItemsTable.fabricVendorOrderId, existing.id))
          .returning({ id: orderItemsTable.id });
        unassigned = [...unassignedProduct, ...unassignedFabric];
      }
      await tx
        .delete(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, existing.id));
      return {
        kind: "deleted" as const,
        id: existing.id,
        vendorOrderNumber: existing.vendorOrderNumber,
        customerOrderId: existing.customerOrderId,
        unassignedItemCount: unassigned.length,
      };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "not_pending") {
      res.status(409).json({
        error: `Cannot delete vendor order in status '${result.status}' — cancel it instead`,
      });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.delete",
      entityType: "vendor_order",
      entityId: result.id,
      changes: {
        vendorOrderNumber: result.vendorOrderNumber,
        customerOrderId: result.customerOrderId,
        unassignedItemCount: result.unassignedItemCount,
      },
    });
    await recordHistory(req, {
      entityType: "vendor_order",
      entityId: result.id,
      changeType: "delete",
      snapshot: {
        id: result.id,
        vendorOrderNumber: result.vendorOrderNumber,
        customerOrderId: result.customerOrderId,
        unassignedItemCount: result.unassignedItemCount,
      },
    });
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// POST /admin/vendor-orders/:id/edit — edit a PENDING vendor PO (line items +
// details) with a mandatory change note.
//
// Isolation: edits NEVER touch the customer's original order. Changes to an
// existing line are stored as po_* overrides on the shared order_items row
// (the customer order keeps reading the original columns); a removed line is
// flagged po_removed=true (still on the customer order, gone from the PO); an
// added line is a brand-new order_items row with orderId=NULL and
// vendorOrderId=this PO. Every changed/added row gets po_edited=true so the UI
// can flag it. The mandatory note is written to vendor_order_edits.
// ---------------------------------------------------------------------------
router.post(
  "/admin/vendor-orders/:id/edit",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminEditVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminEditVendorOrderBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const changeNote = body.data.changeNote.trim();
    if (changeNote.length === 0) {
      res.status(400).json({ error: "A change note is required." });
      return;
    }
    const id = params.data.id;
    const userId = req.session?.userId ?? null;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      // Editable only while pending OR already sent. Sent-order edits keep the
      // status as-is (resending is a separate, explicit action).
      if (existing.status !== "pending" && existing.status !== "sent") {
        return { kind: "not_pending" as const, status: existing.status };
      }

      // Load this PO's live (non-removed) lines, keyed by id, so we can apply
      // per-line overrides and detect which existing lines the payload keeps.
      const currentRows = await tx
        .select()
        .from(orderItemsTable)
        .where(
          and(
            or(
              eq(orderItemsTable.vendorOrderId, id),
              eq(orderItemsTable.fabricVendorOrderId, id),
            ),
            eq(orderItemsTable.poRemoved, false),
          ),
        );
      const rowById = new Map(currentRows.map((r) => [r.id, r]));

      for (const item of body.data.items) {
        const sku = item.sku?.trim() || null;
        const description = item.description.trim();
        const subDescription = item.subDescription?.trim() || null;
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;

        if (item.id != null) {
          const row = rowById.get(item.id);
          // Ignore ids that don't belong to this PO (defensive).
          if (!row) continue;

          if (item.removed === true) {
            await tx
              .update(orderItemsTable)
              .set({ poRemoved: true, poEdited: true })
              .where(eq(orderItemsTable.id, row.id));
            continue;
          }

          // Compare against the current EFFECTIVE values so a no-op save
          // doesn't spuriously flag the line.
          const effSku =
            row.poSku ?? row.variantSkuSnapshot ?? row.productSkuSnapshot ?? null;
          const effDescription = row.poDescription ?? row.description;
          const effSubDescription =
            row.poSubDescription ?? row.variantNameSnapshot ?? null;
          const effQuantity = row.poQuantity ?? row.quantity;
          const effUnitPrice = Number(row.poUnitPrice ?? row.unitPrice);

          const changed =
            sku !== effSku ||
            description !== effDescription ||
            subDescription !== effSubDescription ||
            quantity !== effQuantity ||
            unitPrice !== effUnitPrice;

          if (changed) {
            await tx
              .update(orderItemsTable)
              .set({
                poEdited: true,
                poSku: sku,
                poDescription: description,
                poSubDescription: subDescription,
                poQuantity: quantity,
                poUnitPrice: unitPrice.toFixed(2),
              })
              .where(eq(orderItemsTable.id, row.id));
          }
        } else {
          // Added line: a fresh order_items row owned solely by this PO.
          await tx.insert(orderItemsTable).values({
            orderId: null,
            vendorOrderId: id,
            productId: null,
            productSkuSnapshot: sku,
            description,
            variantNameSnapshot: subDescription,
            quantity,
            unitPrice: unitPrice.toFixed(2),
            amount: (unitPrice * quantity).toFixed(2),
            poEdited: true,
          });
        }
      }

      // Detail fields are edited inside the same audited edit flow.
      const voUpdates: Partial<VendorOrder> = {};
      if (body.data.notes !== undefined) voUpdates.notes = body.data.notes ?? null;
      if (body.data.noteToVendor !== undefined)
        voUpdates.noteToVendor = body.data.noteToVendor ?? null;
      if (body.data.vendorEstimatedDeliveryDate !== undefined) {
        voUpdates.vendorEstimatedDeliveryDate =
          body.data.vendorEstimatedDeliveryDate
            ? new Date(body.data.vendorEstimatedDeliveryDate)
            : null;
      }
      if (Object.keys(voUpdates).length > 0) {
        await tx
          .update(vendorOrdersTable)
          .set(voUpdates)
          .where(eq(vendorOrdersTable.id, id));
      }

      await tx.insert(vendorOrderEditsTable).values({
        vendorOrderId: id,
        editedByUserId: userId,
        note: changeNote,
      });

      return { kind: "ok" as const, id };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "not_pending") {
      res.status(409).json({
        error: `Only pending or sent vendor orders can be edited (this one is '${result.status}').`,
      });
      return;
    }

    await recordAudit(req, {
      action: "vendor_order.edit",
      entityType: "vendor_order",
      entityId: result.id,
      changes: { changeNote, itemCount: body.data.items.length },
    });
    await recordHistory(req, {
      entityType: "vendor_order",
      entityId: result.id,
      changeType: "update",
      snapshot: { changeNote, items: body.data.items },
    });

    const detail = await loadVendorOrderDetail(result.id);
    res.json(detail);
  },
);

router.post(
  "/admin/orders/:orderId/vendor-orders/generate",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGenerateVendorOrdersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid orderId" });
      return;
    }
    const body = AdminGenerateVendorOrdersBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const orderId = params.data.orderId;

    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!order) return { kind: "not_found" as const };
      // Don't generate vendor orders for orders that are no longer live.
      if (order.status === "canceled" || order.status === "refunded") {
        return {
          kind: "bad_state" as const,
          status: order.status,
        };
      }
      // Quick in-stock sales are flagged to skip vendor restock orders.
      if (order.skipVendorOrder) {
        return { kind: "skipped" as const };
      }

      // Delegate to the shared helper so this manual-trigger path
      // creates BOTH product POs and fabric-only POs (alternate fabric
      // vendor) using identical grouping logic. Without this, a
      // previously-deleted fabric PO could not be regenerated from
      // the admin UI.
      const auto = await autoGenerateVendorOrders(
        tx,
        orderId,
        userId,
        body.data.notes ?? null,
      );

      // Re-derive per-PO item counts (count of order_items whose
      // vendor_order_id OR fabric_vendor_order_id points at the new PO)
      // so the response payload still matches the existing
      // AdminVendorOrderSummary contract.
      const createdSummaries: Array<{
        id: number;
        manufacturerId: number;
        itemCount: number;
      }> = [];
      if (auto.createdVendorOrderIds.length > 0) {
        const newVos = await tx
          .select({
            id: vendorOrdersTable.id,
            manufacturerId: vendorOrdersTable.manufacturerId,
          })
          .from(vendorOrdersTable)
          .where(inArray(vendorOrdersTable.id, auto.createdVendorOrderIds));
        for (const vo of newVos) {
          if (vo.manufacturerId == null) continue;
          const productCount = await tx
            .select({ id: orderItemsTable.id })
            .from(orderItemsTable)
            .where(eq(orderItemsTable.vendorOrderId, vo.id));
          const fabricCount = await tx
            .select({ id: orderItemsTable.id })
            .from(orderItemsTable)
            .where(eq(orderItemsTable.fabricVendorOrderId, vo.id));
          createdSummaries.push({
            id: vo.id,
            manufacturerId: vo.manufacturerId,
            itemCount: productCount.length + fabricCount.length,
          });
        }
      }

      return {
        kind: "ok" as const,
        createdSummaries,
        skipped: auto.skippedItemCount,
        assigned: auto.assignedItemCount,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result.kind === "bad_state") {
      res.status(409).json({
        error: `Cannot generate vendor orders for an order in status '${result.status}'`,
      });
      return;
    }
    if (result.kind === "skipped") {
      res.status(409).json({
        error:
          "This order is flagged to skip vendor restock orders (in-stock sale).",
      });
      return;
    }

    // Re-read the just-created vendor orders with manufacturer + customer order
    // info so the response matches AdminVendorOrderSummary exactly.
    const created = result.createdSummaries.length
      ? await db
          .select({
            vo: vendorOrdersTable,
            mfg: manufacturersTable,
            order: ordersTable,
          })
          .from(vendorOrdersTable)
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
          )
          .leftJoin(
            ordersTable,
            eq(ordersTable.id, vendorOrdersTable.customerOrderId),
          )
          .where(
            inArray(
              vendorOrdersTable.id,
              result.createdSummaries.map((s) => s.id),
            ),
          )
          .orderBy(asc(vendorOrdersTable.id))
      : [];
    const itemCountById = new Map(
      result.createdSummaries.map((s) => [s.id, s.itemCount]),
    );

    if (result.createdSummaries.length > 0) {
      await recordAudit(req, {
        action: "vendor_order.generate",
        entityType: "order",
        entityId: orderId,
        changes: {
          createdIds: result.createdSummaries.map((s) => s.id),
          assignedItemCount: result.assigned,
          skippedItemCount: result.skipped,
        },
      });
    }

    res.json({
      created: created.map((r) => ({
        id: r.vo.id,
        vendorOrderNumber: r.vo.vendorOrderNumber,
        status: r.vo.status,
        manufacturerId: r.vo.manufacturerId,
        manufacturerName: r.mfg?.name ?? null,
        customerOrderId: r.vo.customerOrderId,
        customerOrderNumber: r.order?.orderNumber ?? null,
        notes: r.vo.notes,
        vendorEstimatedDeliveryDate: r.vo.vendorEstimatedDeliveryDate
          ? r.vo.vendorEstimatedDeliveryDate.toISOString()
          : null,
        sentAt: r.vo.sentAt ? r.vo.sentAt.toISOString() : null,
        acknowledgedAt: r.vo.acknowledgedAt
          ? r.vo.acknowledgedAt.toISOString()
          : null,
        fulfilledAt: r.vo.fulfilledAt ? r.vo.fulfilledAt.toISOString() : null,
        receivedAt: r.vo.receivedAt ? r.vo.receivedAt.toISOString() : null,
        itemsReceived: r.vo.itemsReceived,
        itemCount: itemCountById.get(r.vo.id) ?? 0,
        createdAt: r.vo.createdAt.toISOString(),
      })),
      skippedItemCount: result.skipped,
      assignedItemCount: result.assigned,
    });
  },
);

router.post(
  "/admin/vendor-orders/:id/send",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSendVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminSendVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      const isResend = existing.sentAt !== null;
      // Terminal statuses block initial sends, but resends (where the PO was
      // already delivered at least once) are always permitted regardless of status.
      if (!isResend && TERMINAL_STATUSES.has(existing.status)) {
        return {
          kind: "terminal" as const,
          status: existing.status,
        };
      }
      const updates: Partial<VendorOrder> = {};
      if (existing.status === "pending") updates.status = "sent";
      if (!existing.sentAt) updates.sentAt = new Date();
      if (Object.keys(updates).length > 0) {
        await tx
          .update(vendorOrdersTable)
          .set(updates)
          .where(eq(vendorOrdersTable.id, existing.id));
      }
      await tx.insert(vendorOrderSendsTable).values({
        vendorOrderId: existing.id,
        sentByUserId: userId,
        sentToEmail: body.data.sentToEmail ?? null,
        pdfStorageUrl: body.data.pdfStorageUrl ?? null,
        isResend,
        resendNote: isResend ? (body.data.resendNote ?? null) : null,
        correctionNote: isResend
          ? (body.data.correctionNote?.trim() || null)
          : null,
      });
      return {
        kind: "ok" as const,
        isResend,
        correctionNote: isResend
          ? (body.data.correctionNote?.trim() || null)
          : null,
      };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "terminal") {
      res.status(400).json({
        error: `Cannot send a vendor order in status '${result.status}'`,
      });
      return;
    }
    await recordAudit(req, {
      action: result.isResend ? "vendor_order.resend" : "vendor_order.send",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { sentToEmail: body.data.sentToEmail ?? null },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: result.isResend ? "resent" : "sent",
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);

    // Generate PDF and upload to object storage (non-fatal — email and DB
    // state are not rolled back if PDF generation or upload fails).
    let pdfStorageUrl: string | null = null;
    let pdfBuffer: Buffer | undefined;
    if (detail) {
      try {
        pdfBuffer = await generateVendorOrderPdf({
          vendorOrderNumber: detail.vendorOrderNumber,
          dateOrdered: detail.createdAt,
          customerOrderNumber: detail.customerOrderNumber,
          customerName: detail.customerName,
          notes: detail.notes,
          noteToVendor: detail.noteToVendor,
          correctionNote: result.correctionNote,
          items: detail.items,
          manufacturerName: detail.manufacturerName,
          manufacturerAddressLine1: detail.manufacturerAddressLine1,
          manufacturerAddressLine2: detail.manufacturerAddressLine2,
          manufacturerCity: detail.manufacturerCity,
          manufacturerState: detail.manufacturerState,
          manufacturerPostalCode: detail.manufacturerPostalCode,
          manufacturerPhone: detail.manufacturerPhone,
          manufacturerFax: detail.manufacturerFax,
          manufacturerEmail: detail.manufacturerOrderEmail,
          shipToStore: detail.shipToStore,
          shipToName: detail.shipToName,
          shipToLine1: detail.shipToLine1,
          shipToLine2: detail.shipToLine2,
          shipToCity: detail.shipToCity,
          shipToState: detail.shipToState,
          shipToPostalCode: detail.shipToPostalCode,
          shipToPhone: detail.shipToPhone,
        });
        pdfStorageUrl = await uploadBufferToStorage(
          pdfBuffer,
          "application/pdf",
          "vendor-orders",
        );
        // Back-fill the PDF URL on the send row that was just inserted.
        await db
          .update(vendorOrderSendsTable)
          .set({ pdfStorageUrl })
          .where(
            and(
              eq(vendorOrderSendsTable.vendorOrderId, params.data.id),
              isNull(vendorOrderSendsTable.pdfStorageUrl),
            ),
          );
        req.log.info(
          { vendorOrderId: params.data.id, pdfStorageUrl },
          "Vendor order PDF generated and stored",
        );
      } catch (err) {
        req.log.error(
          { err, vendorOrderId: params.data.id },
          "Failed to generate or upload vendor order PDF",
        );
      }
    }

    // Resolve the destination email: explicit override from the request body,
    // or fall back to the manufacturer's configured order email.
    const toEmail =
      body.data.sentToEmail?.trim() || detail?.manufacturerOrderEmail || null;

    if (toEmail && detail) {
      try {
        if (result.isResend && !body.data.noChanges) {
          // Resending an already-sent PO with edits — send the Revised PO
          // template. A plain "Resend (no changes)" (noChanges=true) instead
          // sends the original PO template below with a RESENT: subject.
          await sendVendorOrderRevisionEmail({
            to: toEmail,
            vendorOrderNumber: detail.vendorOrderNumber,
            manufacturerName: detail.manufacturerName,
            items: detail.items,
            pdfBuffer,
          });
          req.log.info(
            { vendorOrderId: params.data.id, to: toEmail },
            "Vendor order revision email sent",
          );
        } else {
          await sendVendorOrderEmail({
            to: toEmail,
            vendorOrderNumber: detail.vendorOrderNumber,
            customerOrderNumber: detail.customerOrderNumber,
            manufacturerName: detail.manufacturerName,
            notes: detail.notes,
            items: detail.items,
            pdfBuffer,
            isResend: result.isResend,
          });
          req.log.info(
            { vendorOrderId: params.data.id, to: toEmail },
            "Vendor order email sent",
          );
        }
      } catch (err) {
        req.log.error(
          { err, vendorOrderId: params.data.id, to: toEmail },
          "Failed to send vendor order email",
        );
      }
    } else if (!toEmail) {
      req.log.warn(
        { vendorOrderId: params.data.id },
        "Vendor order send recorded but no email address available — set an order email on the manufacturer or enter one in the send dialog",
      );
    }

    // Reload detail so the PDF URL is present in the response.
    const finalDetail = await loadVendorOrderDetail(params.data.id);
    res.json(finalDetail);
  },
);

router.post(
  "/admin/vendor-orders/:id/status",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateVendorOrderStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateVendorOrderStatusBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.has(body.data.toStatus)) {
        return {
          kind: "invalid_transition" as const,
          from: existing.status,
          to: body.data.toStatus,
        };
      }
      const updates: Partial<VendorOrder> = { status: body.data.toStatus };
      if (body.data.toStatus === "acknowledged" && !existing.acknowledgedAt) {
        updates.acknowledgedAt = new Date();
      }
      if (body.data.toStatus === "fulfilled" && !existing.fulfilledAt) {
        updates.fulfilledAt = new Date();
      }
      await tx
        .update(vendorOrdersTable)
        .set(updates)
        .where(eq(vendorOrdersTable.id, existing.id));
      return { kind: "ok" as const };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "invalid_transition") {
      res.status(409).json({
        error: `Cannot transition vendor order from '${result.from}' to '${result.to}'`,
      });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.status_change",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { toStatus: body.data.toStatus, note: body.data.note ?? null },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: `status → ${body.data.toStatus}${body.data.note ? `: ${body.data.note}` : ""}`,
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

router.post(
  "/admin/vendor-orders/:id/receive",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminReceiveVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminReceiveVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const requestedItems = body.data.items; // [{ orderItemId, quantity }]

    type ReceiveTxResult =
      | { kind: "not_found" }
      | { kind: "invalid"; status: string }
      | { kind: "bad_items"; msg: string }
      | { kind: "no_default_location" }
      | { kind: "ok"; newStatus: "received" | "partially_received" };

    let txResult: ReceiveTxResult;
    try {
      txResult = await db.transaction<ReceiveTxResult>(async (tx) => {
        const [existing] = await tx
          .select()
          .from(vendorOrdersTable)
          .where(eq(vendorOrdersTable.id, params.data.id))
          .for("update")
          .limit(1);
        if (!existing) return { kind: "not_found" };
        if (existing.status === "received" || existing.status === "canceled" || existing.status === "pending") {
          return { kind: "invalid", status: existing.status };
        }

        // Load all non-removed items on this PO (product lines + fabric lines)
        const productLineRows = await tx
          .select()
          .from(orderItemsTable)
          .where(and(eq(orderItemsTable.vendorOrderId, existing.id), eq(orderItemsTable.poRemoved, false)));
        const fabricLineRows = await tx
          .select()
          .from(orderItemsTable)
          .where(and(eq(orderItemsTable.fabricVendorOrderId, existing.id), eq(orderItemsTable.poRemoved, false)));
        const allItems = [...productLineRows, ...fabricLineRows];
        const itemById = new Map(allItems.map((x) => [x.id, x]));

        // Validate requested items
        const requestedMap = new Map<number, number>();
        for (const ri of requestedItems) {
          const item = itemById.get(ri.orderItemId);
          if (!item) return { kind: "bad_items", msg: `Item ${ri.orderItemId} not found on this vendor order` };
          const remaining = item.quantity - item.receivedQuantity;
          if (ri.quantity > remaining) {
            return { kind: "bad_items", msg: `Item ${ri.orderItemId}: requested ${ri.quantity} but only ${remaining} remaining` };
          }
          requestedMap.set(ri.orderItemId, ri.quantity);
        }

        // Decide whether to bump on-hand inventory. Restock orders and any
        // ship-to-store staff orders both bring physical goods to our shelves.
        let shouldBumpInventory = false;
        let restockLocationId: number | null = null;
        if (existing.customerOrderId != null) {
          const [parent] = await tx
            .select({ isInternalRestock: ordersTable.isInternalRestock, shipToStore: ordersTable.shipToStore })
            .from(ordersTable)
            .where(eq(ordersTable.id, existing.customerOrderId));
          shouldBumpInventory = parent?.isInternalRestock === true || parent?.shipToStore === true;
          if (existing.shipToStoreOverride === false) shouldBumpInventory = false;
          if (existing.shipToStoreOverride === true) shouldBumpInventory = true;
        } else {
          shouldBumpInventory = existing.shipToStoreOverride !== false;
        }
        if (shouldBumpInventory) {
          const [defaultLoc] = await tx
            .select({ id: inventoryLocationsTable.id })
            .from(inventoryLocationsTable)
            .where(eq(inventoryLocationsTable.isDefault, true));
          if (!defaultLoc) return { kind: "no_default_location" };
          restockLocationId = defaultLoc.id;
        }

        const now = new Date();

        // Increment received_quantity on each requested item
        for (const ri of requestedItems) {
          const item = itemById.get(ri.orderItemId)!;
          await tx
            .update(orderItemsTable)
            .set({ receivedQuantity: item.receivedQuantity + ri.quantity })
            .where(eq(orderItemsTable.id, ri.orderItemId));
        }

        // Determine new status: fully received only when every item is at capacity
        const fullyReceived = allItems.every((item) => {
          const addedNow = requestedMap.get(item.id) ?? 0;
          return item.receivedQuantity + addedNow >= item.quantity;
        });
        const newStatus: "received" | "partially_received" = fullyReceived ? "received" : "partially_received";

        if (newStatus === "received") {
          await tx
            .update(vendorOrdersTable)
            .set({ status: "received", itemsReceived: true, receivedAt: now, receivedByUserId: userId })
            .where(eq(vendorOrdersTable.id, existing.id));
        } else {
          await tx
            .update(vendorOrdersTable)
            .set({ status: "partially_received" })
            .where(eq(vendorOrdersTable.id, existing.id));
        }

        // Insert receive event log
        const receiveItemsSnapshot = requestedItems.map((ri) => {
          const item = itemById.get(ri.orderItemId)!;
          return {
            orderItemId: ri.orderItemId,
            sku: item.variantSkuSnapshot ?? item.productSkuSnapshot ?? null,
            description: item.description,
            quantityReceived: ri.quantity,
          };
        });
        await tx.insert(vendorOrderReceivesTable).values({
          vendorOrderId: existing.id,
          receivedByUserId: userId,
          notes: body.data.notes ?? null,
          items: receiveItemsSnapshot,
        });

        // Insert inventory receipt record for audit trail
        await tx.insert(inventoryReceiptsTable).values({
          vendorOrderId: existing.id,
          receivedByUserId: userId,
          linkedOrderId: existing.customerOrderId,
          locationId: restockLocationId,
          notes: body.data.notes ?? null,
        });

        // Bump on-hand inventory for product-PO lines when applicable.
        // vendorPortion = total qty expected from vendor (qty − already used from stock)
        // alreadyBumped = min(receivedQty before this event, vendorPortion)
        // bumpNow = min(receivingNow, max(vendorPortion − alreadyBumped, 0))
        if (shouldBumpInventory) {
          for (const ri of requestedItems) {
            const item = itemById.get(ri.orderItemId);
            if (!item || item.productId == null) continue;
            if (item.vendorOrderId !== existing.id) continue; // skip fabric-only lines

            const vendorPortion = Math.max(item.quantity - item.inventoryQtyUsed, 0);
            const alreadyBumped = Math.min(item.receivedQuantity, vendorPortion);
            const bumpQty = Math.min(ri.quantity, Math.max(vendorPortion - alreadyBumped, 0));
            if (bumpQty <= 0) continue;

            const pid = item.productId;
            const vid = item.variantId;
            const fid = item.fabricId;
            const variantCond = vid == null ? isNull(inventoryTable.variantId) : eq(inventoryTable.variantId, vid);
            const fabricCond = fid == null ? isNull(inventoryTable.fabricId) : eq(inventoryTable.fabricId, fid);

            let [inv] = await tx
              .select()
              .from(inventoryTable)
              .where(and(eq(inventoryTable.productId, pid), variantCond, fabricCond))
              .for("update");
            if (!inv) {
              const [created] = await tx
                .insert(inventoryTable)
                .values({ productId: pid, variantId: vid, fabricId: fid, onHand: 0, onHold: 0, reorderThreshold: 0 })
                .returning();
              const [locked] = await tx.select().from(inventoryTable).where(eq(inventoryTable.id, created!.id)).for("update");
              inv = locked!;
            }
            const newOnHand = inv.onHand + bumpQty;
            await tx.update(inventoryTable).set({ onHand: newOnHand }).where(eq(inventoryTable.id, inv.id));
            await tx.insert(inventoryAdjustmentsTable).values({
              productId: pid, variantId: vid, fabricId: fid,
              inventoryId: inv.id, locationId: restockLocationId,
              adjustmentType: "vendor_receipt",
              quantityChange: bumpQty, quantityAfter: newOnHand,
              vendorOrderId: existing.id, orderId: existing.customerOrderId,
              performedByUserId: userId,
            });
          }
        }

        return { kind: "ok", newStatus };
      });
    } catch (err) {
      req.log.error({ err }, "receive vendor order failed");
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    if (txResult.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (txResult.kind === "invalid") {
      res.status(409).json({ error: `Cannot receive a '${txResult.status}' vendor order` });
      return;
    }
    if (txResult.kind === "bad_items") {
      res.status(400).json({ error: txResult.msg });
      return;
    }
    if (txResult.kind === "no_default_location") {
      res.status(400).json({ error: "Cannot receive restock: no default inventory location is configured. Set one in Inventory → Locations." });
      return;
    }

    await recordAudit(req, {
      action: "vendor_order.receive",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { newStatus: txResult.newStatus, notes: body.data.notes ?? null },
    });
    const [voRow] = await db.select().from(vendorOrdersTable).where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: `${txResult.newStatus === "received" ? "fully received" : "partially received"}${body.data.notes ? `: ${body.data.notes}` : ""}`,
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

// Cancel a pending (unsent) vendor order without generating a PDF or notifying
// the vendor. Un-assigns items so they can be regrouped; retains the PO record
// with status='canceled'. Partial scope leaves the PO in 'pending' with the
// surviving items still attached.
router.post(
  "/admin/vendor-orders/:id/cancel-pending",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCancelPendingVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCancelPendingVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = body.data.scope;
    const reason = body.data.reason?.trim() || null;
    const requestedItemIds = body.data.itemIds ?? [];

    if (scope === "partial" && requestedItemIds.length === 0) {
      res.status(400).json({ error: "Partial cancellation requires at least one itemId" });
      return;
    }

    type PendingCancelResult =
      | { kind: "not_found" }
      | { kind: "not_pending"; status: string }
      | { kind: "bad_items" }
      | { kind: "ok"; effectiveScope: "full" | "partial" };

    let txResult: PendingCancelResult;
    try {
      txResult = await db.transaction<PendingCancelResult>(async (tx) => {
        const [existing] = await tx
          .select()
          .from(vendorOrdersTable)
          .where(eq(vendorOrdersTable.id, params.data.id))
          .for("update")
          .limit(1);
        if (!existing) return { kind: "not_found" };
        if (existing.status !== "pending") return { kind: "not_pending", status: existing.status };

        const productLineRows = await tx
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.vendorOrderId, existing.id))
          .orderBy(asc(orderItemsTable.id));
        const fabricLineRows = await tx
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.fabricVendorOrderId, existing.id))
          .orderBy(asc(orderItemsTable.id));
        const poKind: "product" | "fabric" =
          fabricLineRows.length > 0 && productLineRows.length === 0 ? "fabric" : "product";
        const allItems = poKind === "fabric" ? fabricLineRows : productLineRows;

        let cancelItems: OrderItem[];
        let remainingItems: OrderItem[];
        if (scope === "full") {
          cancelItems = allItems;
          remainingItems = [];
        } else {
          const requestedSet = new Set(requestedItemIds);
          cancelItems = allItems.filter((it) => requestedSet.has(it.id));
          remainingItems = allItems.filter((it) => !requestedSet.has(it.id));
          if (cancelItems.length !== requestedSet.size || cancelItems.length === 0) {
            return { kind: "bad_items" };
          }
        }

        // Un-assign the cancelled items from this PO
        if (cancelItems.length > 0) {
          if (poKind === "fabric") {
            await tx
              .update(orderItemsTable)
              .set({ fabricVendorOrderId: null })
              .where(inArray(orderItemsTable.id, cancelItems.map((x) => x.id)));
          } else {
            await tx
              .update(orderItemsTable)
              .set({ vendorOrderId: null })
              .where(inArray(orderItemsTable.id, cancelItems.map((x) => x.id)));
          }
        }

        const effectiveScope: "full" | "partial" =
          scope === "full" || remainingItems.length === 0 ? "full" : "partial";
        if (effectiveScope === "full") {
          await tx
            .update(vendorOrdersTable)
            .set({ status: "canceled" })
            .where(eq(vendorOrdersTable.id, existing.id));
        }

        return { kind: "ok", effectiveScope };
      });
    } catch (err) {
      req.log.error({ err }, "cancel pending vendor order failed");
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    if (txResult.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (txResult.kind === "not_pending") {
      res.status(409).json({
        error: `Cannot cancel-pending a '${txResult.status}' vendor order — it has already been sent`,
      });
      return;
    }
    if (txResult.kind === "bad_items") {
      res.status(400).json({ error: "One or more itemIds not found on this vendor order" });
      return;
    }

    await recordAudit(req, {
      action: "vendor_order.cancel_pending",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { scope, reason },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: `canceled pending (${txResult.effectiveScope})${reason ? `: ${reason}` : ""}`,
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

function orderItemToPdfItem(
  it: OrderItem,
  kind: "product" | "fabric" = "product",
): PdfVendorOrderItem {
  return {
    productSkuSnapshot: it.productSkuSnapshot,
    variantSkuSnapshot: it.variantSkuSnapshot,
    variantNameSnapshot: it.variantNameSnapshot,
    weightSnapshot: it.weightSnapshot,
    finishCodeSnapshot: it.finishCodeSnapshot,
    finishNameSnapshot: it.finishNameSnapshot,
    finialCodeSnapshot: it.finialCodeSnapshot,
    finialNameSnapshot: it.finialNameSnapshot,
    fabricItemNumberSnapshot: it.fabricItemNumberSnapshot,
    fabricNameSnapshot: it.fabricNameSnapshot,
    fabricBrandSnapshot: it.fabricBrandSnapshot,
    fabricGradeSnapshot: it.fabricGradeSnapshot,
    description: it.description,
    quantity: Math.max(it.quantity - it.inventoryQtyUsed, 0),
    unitPrice: kind === "fabric" ? 0 : Number(it.unitPrice),
    amount: kind === "fabric" ? 0 : Number(it.amount),
    notes: it.notes,
    kind,
  };
}

// Cancel a vendor order in full or partially.
//   - scope=full: un-assign all items, set status=canceled (terminal).
//   - scope=partial: un-assign only the given itemIds, leave status alone
//     so the remaining items continue through the normal pipeline.
// In both cases we snapshot the cancelled items and generate a cancellation
// PDF (revised PO for partial), store it, and optionally email the vendor.
router.post(
  "/admin/vendor-orders/:id/cancel",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCancelVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCancelVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const scope = body.data.scope;
    const reason = body.data.reason?.trim() || null;
    const requestedItemIds = body.data.itemIds ?? [];

    if (scope === "partial" && requestedItemIds.length === 0) {
      res
        .status(400)
        .json({ error: "Partial cancellation requires at least one itemId" });
      return;
    }

    type CancelTxResult =
      | { kind: "not_found" }
      | { kind: "already_canceled" }
      | { kind: "received" }
      | { kind: "bad_items" }
      | {
          kind: "ok";
          effectiveScope: "full" | "partial";
          cancelItems: PdfVendorOrderItem[];
          remainingItems: PdfVendorOrderItem[];
          cancellationId: number;
          cancelledAt: Date;
        };
    let txResult: CancelTxResult;
    try {
      txResult = await db.transaction<CancelTxResult>(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "canceled") {
        return { kind: "already_canceled" as const };
      }
      if (existing.status === "received") {
        return { kind: "received" as const };
      }

      // Pull every line currently assigned to this VO. POs link items via
      // EITHER vendor_order_id (regular product POs) OR fabric_vendor_order_id
      // (fabric-only POs). We detect the kind from whichever column has rows
      // and operate on that column consistently.
      const productLineRows = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.vendorOrderId, existing.id))
        .orderBy(asc(orderItemsTable.id));
      const fabricLineRows = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.fabricVendorOrderId, existing.id))
        .orderBy(asc(orderItemsTable.id));
      const poKind: "product" | "fabric" =
        fabricLineRows.length > 0 && productLineRows.length === 0
          ? "fabric"
          : "product";
      const allItems: OrderItem[] =
        poKind === "fabric" ? fabricLineRows : productLineRows;

      let cancelItems: OrderItem[];
      let remainingItems: OrderItem[];
      if (scope === "full") {
        cancelItems = allItems;
        remainingItems = [];
      } else {
        const requestedSet = new Set(requestedItemIds);
        cancelItems = allItems.filter((it) => requestedSet.has(it.id));
        remainingItems = allItems.filter((it) => !requestedSet.has(it.id));
        if (cancelItems.length !== requestedSet.size) {
          return { kind: "bad_items" as const };
        }
        if (cancelItems.length === 0) {
          return { kind: "bad_items" as const };
        }
        // Cancelling every line via partial = treat as full so the PO closes.
        if (remainingItems.length === 0) {
          // upgrade to full
          cancelItems = allItems;
        }
      }

      const effectiveScope: "full" | "partial" =
        remainingItems.length === 0 ? "full" : "partial";

      // For customer-order POs we un-assign the cancelled lines so they
      // can be regenerated onto a new vendor order. For standalone POs
      // the cancelled lines have no parent customer order and would
      // become orphans with both orderId and vendorOrderId NULL, so we
      // delete them outright. The extra `<col> = existing.id` predicate
      // guards against concurrent re-assignment to a different VO.
      const cancelIds = cancelItems.map((it) => it.id);
      if (cancelIds.length > 0) {
        const isStandalone = existing.customerOrderId == null;
        const updated = isStandalone
          ? await tx
              .delete(orderItemsTable)
              .where(
                and(
                  inArray(orderItemsTable.id, cancelIds),
                  poKind === "fabric"
                    ? eq(orderItemsTable.fabricVendorOrderId, existing.id)
                    : eq(orderItemsTable.vendorOrderId, existing.id),
                ),
              )
              .returning({ id: orderItemsTable.id })
          : poKind === "fabric"
            ? await tx
                .update(orderItemsTable)
                .set({ fabricVendorOrderId: null })
                .where(
                  and(
                    inArray(orderItemsTable.id, cancelIds),
                    eq(orderItemsTable.fabricVendorOrderId, existing.id),
                  ),
                )
                .returning({ id: orderItemsTable.id })
            : await tx
                .update(orderItemsTable)
                .set({ vendorOrderId: null })
                .where(
                  and(
                    inArray(orderItemsTable.id, cancelIds),
                    eq(orderItemsTable.vendorOrderId, existing.id),
                  ),
                )
                .returning({ id: orderItemsTable.id });
        if (updated.length !== cancelIds.length) {
          // Concurrent modification detected — abort the tx so nothing leaks.
          throw new Error("__STALE_ITEMS__");
        }
      }

      if (effectiveScope === "full") {
        await tx
          .update(vendorOrdersTable)
          .set({ status: "canceled" })
          .where(eq(vendorOrdersTable.id, existing.id));
      }

      const itemsSnapshot = cancelItems.map((it) =>
        orderItemToPdfItem(it, poKind),
      );
      const [cancellationRow] = await tx
        .insert(vendorOrderCancellationsTable)
        .values({
          vendorOrderId: existing.id,
          scope: effectiveScope,
          reason,
          cancelledByUserId: userId,
          items: itemsSnapshot,
        })
        .returning();

      return {
        kind: "ok" as const,
        effectiveScope,
        cancelItems: itemsSnapshot,
        remainingItems: remainingItems.map((it) =>
          orderItemToPdfItem(it, poKind),
        ),
        cancellationId: cancellationRow!.id,
        cancelledAt: cancellationRow!.cancelledAt,
      };
    });
    } catch (err) {
      if (err instanceof Error && err.message === "__STALE_ITEMS__") {
        res.status(409).json({
          error:
            "One or more items were modified by another action. Refresh and try again.",
        });
        return;
      }
      throw err;
    }

    if (txResult.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (txResult.kind === "already_canceled") {
      res.status(409).json({ error: "Vendor order is already canceled" });
      return;
    }
    if (txResult.kind === "received") {
      res
        .status(409)
        .json({ error: "Cannot cancel a received vendor order" });
      return;
    }
    if (txResult.kind === "bad_items") {
      res.status(400).json({
        error:
          "One or more itemIds do not belong to this vendor order, or none were provided",
      });
      return;
    }

    // Audit + history.
    await recordAudit(req, {
      action:
        txResult.effectiveScope === "full"
          ? "vendor_order.cancel"
          : "vendor_order.cancel_partial",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: {
        scope: txResult.effectiveScope,
        reason,
        cancelledItemCount: txResult.cancelItems.length,
      },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes:
          txResult.effectiveScope === "full"
            ? `canceled${reason ? `: ${reason}` : ""}`
            : `partial cancel — ${txResult.cancelItems.length} item(s)${reason ? `: ${reason}` : ""}`,
      });
    }

    // Generate the cancellation/revised PO PDF and upload. Failures here are
    // non-fatal — the cancellation row is already persisted and the items
    // already un-assigned; we just won't have a stored PDF.
    const detailNow = await loadVendorOrderDetail(params.data.id);
    let pdfStorageUrl: string | null = null;
    let pdfBuffer: Buffer | undefined;
    if (detailNow) {
      try {
        pdfBuffer = await generateVendorOrderCancellationPdf({
          vendorOrderNumber: detailNow.vendorOrderNumber,
          dateOrdered: detailNow.createdAt,
          customerOrderNumber: detailNow.customerOrderNumber,
          customerName: detailNow.customerName,
          notes: detailNow.notes,
          items: txResult.cancelItems, // unused in cancellation doc but required by base shape
          manufacturerName: detailNow.manufacturerName,
          manufacturerAddressLine1: detailNow.manufacturerAddressLine1,
          manufacturerAddressLine2: detailNow.manufacturerAddressLine2,
          manufacturerCity: detailNow.manufacturerCity,
          manufacturerState: detailNow.manufacturerState,
          manufacturerPostalCode: detailNow.manufacturerPostalCode,
          manufacturerPhone: detailNow.manufacturerPhone,
          manufacturerFax: detailNow.manufacturerFax,
          manufacturerEmail: detailNow.manufacturerOrderEmail,
          shipToStore: detailNow.shipToStore,
          shipToName: detailNow.shipToName,
          shipToLine1: detailNow.shipToLine1,
          shipToLine2: detailNow.shipToLine2,
          shipToCity: detailNow.shipToCity,
          shipToState: detailNow.shipToState,
          shipToPostalCode: detailNow.shipToPostalCode,
          shipToPhone: detailNow.shipToPhone,
          scope: txResult.effectiveScope,
          reason,
          cancelledItems: txResult.cancelItems,
          remainingItems: txResult.remainingItems,
          cancelledAt: txResult.cancelledAt.toISOString(),
        });
        pdfStorageUrl = await uploadBufferToStorage(
          pdfBuffer,
          "application/pdf",
          "vendor-order-cancellations",
        );
        await db
          .update(vendorOrderCancellationsTable)
          .set({ pdfStorageUrl })
          .where(eq(vendorOrderCancellationsTable.id, txResult.cancellationId));
        req.log.info(
          {
            vendorOrderId: params.data.id,
            cancellationId: txResult.cancellationId,
            pdfStorageUrl,
          },
          "Vendor cancellation PDF generated and stored",
        );
      } catch (err) {
        req.log.error(
          { err, vendorOrderId: params.data.id },
          "Failed to generate or upload vendor cancellation PDF",
        );
      }
    }

    // Optionally email the vendor. Surface delivery status back to the
    // caller so the UI can show a truthful confirmation instead of always
    // claiming the email went out.
    const sendEmail = body.data.sendEmail === true;
    const toEmail =
      body.data.sentToEmail?.trim() ||
      detailNow?.manufacturerOrderEmail ||
      null;
    let emailStatus: "skipped" | "sent" | "failed" | "no_address" = "skipped";
    let emailError: string | null = null;
    if (sendEmail) {
      if (toEmail && detailNow) {
        try {
          if (txResult.effectiveScope === "full") {
            await sendVendorOrderCancellationEmail({
              to: toEmail,
              vendorOrderNumber: detailNow.vendorOrderNumber,
              manufacturerName: detailNow.manufacturerName,
              reason,
              cancelledItems: txResult.cancelItems,
              pdfBuffer,
            });
          } else {
            // Partial cancellation — this is a revision to the PO, not a
            // cancellation of it. Send the clean Revised PO template with
            // the items still remaining, no cancellation language.
            await sendVendorOrderRevisionEmail({
              to: toEmail,
              vendorOrderNumber: detailNow.vendorOrderNumber,
              manufacturerName: detailNow.manufacturerName,
              items: txResult.remainingItems,
              pdfBuffer,
            });
          }
          await db
            .update(vendorOrderCancellationsTable)
            .set({ emailedAt: new Date(), emailedTo: toEmail })
            .where(
              eq(vendorOrderCancellationsTable.id, txResult.cancellationId),
            );
          emailStatus = "sent";
          req.log.info(
            {
              vendorOrderId: params.data.id,
              cancellationId: txResult.cancellationId,
              to: toEmail,
              scope: txResult.effectiveScope,
            },
            "Vendor cancellation/revision email sent",
          );
        } catch (err) {
          emailStatus = "failed";
          emailError =
            err instanceof Error ? err.message : "Unknown email error";
          req.log.error(
            { err, vendorOrderId: params.data.id, to: toEmail },
            "Failed to send vendor cancellation email",
          );
        }
      } else {
        emailStatus = "no_address";
        req.log.warn(
          { vendorOrderId: params.data.id },
          "Vendor cancellation recorded but no email address available",
        );
      }
    }

    const finalDetail = await loadVendorOrderDetail(params.data.id);
    res.json({ ...finalDetail, emailStatus, emailError });
  },
);

export default router;
