import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  cushionOrdersTable,
  cushionOrderItemsTable,
  productsTable,
  fabricsTable,
  CUSHION_ORDER_STATUSES,
} from "@workspace/db";
import {
  SubmitCushionOrderBody,
  UpdateCushionOrderBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { cushionSubmitRateLimiter } from "../middlewares/rateLimit";
import {
  sendCustomerConfirmationEmail,
  sendAdminAlertEmail,
  summarizeItems,
} from "../lib/cushionEmail";
import { renderCushionOrderPdf } from "../lib/cushionPdf";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function generateOrderNumber(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CO-${yyyy}${mm}${dd}-${rand}`;
}

function numToStr(n: number | null | undefined): string | null {
  if (n == null) return null;
  return String(n);
}

function summarizeRows(
  rows: Array<{
    cushionType: string | null;
    productName: string | null;
    quantity: number;
  }>,
): string {
  return summarizeItems(rows);
}

// ---------- Public submit ----------
router.post(
  "/cushions/orders",
  cushionSubmitRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SubmitCushionOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      });
      return;
    }
    const data = parsed.data;

    if (data.orderKind === "custom") {
      if (!data.fabricName || data.fabricName.trim() === "") {
        res.status(400).json({ error: "Fabric Name/# is required" });
        return;
      }
      if (
        !data.items.every(
          (it) => it.cushionType && it.cushionType !== null,
        )
      ) {
        res
          .status(400)
          .json({ error: "Each custom item must have a cushion type" });
        return;
      }
    } else {
      if (!data.items.every((it) => it.productId)) {
        res.status(400).json({
          error: "Each replacement-cushion item must reference a product",
        });
        return;
      }
    }

    // Pre-validate referenced product/fabric ids so we return a clean 400
    // instead of a 500 on FK failure inside the transaction.
    const referencedProductIds = Array.from(
      new Set(
        data.items
          .map((i) => i.productId)
          .filter((v): v is number => typeof v === "number"),
      ),
    );
    const referencedFabricIds = Array.from(
      new Set(
        data.items
          .map((i) => i.fabricId)
          .filter((v): v is number => typeof v === "number"),
      ),
    );
    if (referencedProductIds.length) {
      const found = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(inArray(productsTable.id, referencedProductIds));
      if (found.length !== referencedProductIds.length) {
        res.status(400).json({ error: "One or more selected products no longer exist" });
        return;
      }
    }
    if (referencedFabricIds.length) {
      const found = await db
        .select({ id: fabricsTable.id })
        .from(fabricsTable)
        .where(inArray(fabricsTable.id, referencedFabricIds));
      if (found.length !== referencedFabricIds.length) {
        res.status(400).json({ error: "One or more selected fabrics no longer exist" });
        return;
      }
    }

    const orderNumber = generateOrderNumber();

    const orderRow = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(cushionOrdersTable)
        .values({
          orderNumber,
          orderKind: data.orderKind,
          status: "submitted",
          customerName: data.customerName,
          customerEmail: data.customerEmail ?? null,
          customerPhone: data.customerPhone ?? null,
          fabricName: data.orderKind === "custom" ? (data.fabricName ?? null) : null,
          fabricItemNumber:
            data.orderKind === "custom" ? (data.fabricItemNumber ?? null) : null,
          contrastingFabricName:
            data.orderKind === "custom"
              ? (data.contrastingFabricName ?? null)
              : null,
          ties: data.orderKind === "custom" ? (data.ties ?? null) : null,
          seatWelt: data.orderKind === "custom" ? (data.seatWelt ?? null) : null,
          backWelt: data.orderKind === "custom" ? (data.backWelt ?? null) : null,
          buttons: data.orderKind === "custom" ? (data.buttons ?? null) : null,
          tuft: data.orderKind === "custom" ? (data.tuft ?? null) : null,
          templateAvailable:
            data.orderKind === "custom"
              ? (data.templateAvailable ?? null)
              : null,
          customerNotes: data.customerNotes ?? null,
        })
        .returning();
      if (!inserted) throw new Error("Insert failed");

      // Snapshot product names for stock items
      const productMap = new Map<number, { name: string; sku: string }>();
      if (referencedProductIds.length) {
        const prods = await tx
          .select({
            id: productsTable.id,
            name: productsTable.name,
            sku: productsTable.sku,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, referencedProductIds));
        for (const p of prods) productMap.set(p.id, { name: p.name, sku: p.sku });
      }

      // Snapshot fabric name + item number for stock items so the admin/PDF
      // is stable even if the catalog fabric is later renamed/removed.
      const fabricMap = new Map<number, { name: string; itemNumber: string | null }>();
      if (referencedFabricIds.length) {
        const fabs = await tx
          .select({
            id: fabricsTable.id,
            name: fabricsTable.name,
            itemNumber: fabricsTable.itemNumber,
          })
          .from(fabricsTable)
          .where(inArray(fabricsTable.id, referencedFabricIds));
        for (const f of fabs)
          fabricMap.set(f.id, { name: f.name, itemNumber: f.itemNumber ?? null });
      }

      await tx.insert(cushionOrderItemsTable).values(
        data.items.map((it, idx) => {
          const prod = it.productId ? productMap.get(it.productId) : undefined;
          const fab = it.fabricId ? fabricMap.get(it.fabricId) : undefined;
          return {
            orderId: inserted.id,
            position: idx,
            quantity: it.quantity,
            notes: it.notes ?? null,
            cushionType: it.cushionType ?? null,
            measurementA: numToStr(it.measurementA ?? null),
            measurementB: numToStr(it.measurementB ?? null),
            measurementC: numToStr(it.measurementC ?? null),
            measurementD: numToStr(it.measurementD ?? null),
            measurementE: numToStr(it.measurementE ?? null),
            measurementF: numToStr(it.measurementF ?? null),
            thickness: numToStr(it.thickness ?? null),
            productId: it.productId ?? null,
            productNameSnapshot: prod?.name ?? null,
            productSkuSnapshot: prod?.sku ?? null,
            fabricId: it.fabricId ?? null,
            // When fabricId is supplied, the canonical name/number must come
            // from the catalog snapshot — not client-supplied text — so the
            // stored admin record can't be tampered with via the public form.
            fabricName: fab ? fab.name : (it.fabricName ?? null),
            fabricItemNumber: fab
              ? fab.itemNumber
              : (it.fabricItemNumber ?? null),
          };
        }),
      );

      return inserted;
    });

    // Fire-and-forget emails
    const summary = summarizeRows(
      data.items.map((it) => ({
        cushionType: it.cushionType ?? null,
        productName: it.productId ? `Product #${it.productId}` : null,
        quantity: it.quantity,
      })),
    );

    if (orderRow.customerEmail) {
      void sendCustomerConfirmationEmail({
        to: orderRow.customerEmail,
        customerName: orderRow.customerName,
        orderNumber: orderRow.orderNumber,
        itemSummary: summary,
        orderKind: data.orderKind,
      }).catch((err) =>
        logger.error(
          { err, orderNumber: orderRow.orderNumber },
          "Cushion customer confirmation email failed",
        ),
      );
    }
    const adminEmail = process.env["ADMIN_EMAIL"];
    if (adminEmail) {
      const baseUrl =
        process.env["PUBLIC_BASE_URL"] ??
        (process.env["REPLIT_DOMAINS"]?.split(",")[0]
          ? `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`
          : "");
      void sendAdminAlertEmail({
        to: adminEmail,
        orderNumber: orderRow.orderNumber,
        customerName: orderRow.customerName,
        itemSummary: summary,
        detailUrl: `${baseUrl}/admin/cushion-orders/${orderRow.id}`,
        orderKind: data.orderKind,
      }).catch((err) =>
        logger.error(
          { err, orderNumber: orderRow.orderNumber },
          "Cushion admin alert email failed",
        ),
      );
    }

    res.json({ id: orderRow.id, orderNumber: orderRow.orderNumber });
  },
);

// ---------- Staff list ----------
router.get(
  "/cushions/orders",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const statusRaw = typeof req.query.status === "string" ? req.query.status : null;
    if (statusRaw && !CUSHION_ORDER_STATUSES.includes(statusRaw as never)) {
      res.status(400).json({ error: "Invalid status filter" });
      return;
    }
    const status = statusRaw as (typeof CUSHION_ORDER_STATUSES)[number] | null;
    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit ?? 50) || 50),
    );
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

    const where = status ? eq(cushionOrdersTable.status, status) : undefined;

    const rows = await db
      .select({
        id: cushionOrdersTable.id,
        orderNumber: cushionOrdersTable.orderNumber,
        orderKind: cushionOrdersTable.orderKind,
        status: cushionOrdersTable.status,
        customerName: cushionOrdersTable.customerName,
        customerEmail: cushionOrdersTable.customerEmail,
        submittedAt: cushionOrdersTable.submittedAt,
      })
      .from(cushionOrdersTable)
      .where(where ?? sql`true`)
      .orderBy(desc(cushionOrdersTable.submittedAt))
      .limit(limit)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    const itemsByOrder = new Map<
      number,
      Array<{ cushionType: string | null; productName: string | null; quantity: number }>
    >();
    if (ids.length) {
      const itemRows = await db
        .select({
          orderId: cushionOrderItemsTable.orderId,
          cushionType: cushionOrderItemsTable.cushionType,
          quantity: cushionOrderItemsTable.quantity,
          productName: cushionOrderItemsTable.productNameSnapshot,
        })
        .from(cushionOrderItemsTable)
        .where(inArray(cushionOrderItemsTable.orderId, ids));
      for (const it of itemRows) {
        const list = itemsByOrder.get(it.orderId) ?? [];
        list.push({
          cushionType: it.cushionType,
          productName: it.productName,
          quantity: it.quantity,
        });
        itemsByOrder.set(it.orderId, list);
      }
    }

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(cushionOrdersTable)
      .where(where ?? sql`true`);

    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        orderKind: r.orderKind,
        status: r.status,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        submittedAt:
          r.submittedAt instanceof Date
            ? r.submittedAt.toISOString()
            : String(r.submittedAt),
        itemSummary: summarizeRows(itemsByOrder.get(r.id) ?? []),
      })),
      total,
    });
  },
);

// ---------- Staff get detail ----------
async function loadDetail(id: number) {
  const [order] = await db
    .select()
    .from(cushionOrdersTable)
    .where(eq(cushionOrdersTable.id, id))
    .limit(1);
  if (!order) return null;
  const items = await db
    .select({
      id: cushionOrderItemsTable.id,
      position: cushionOrderItemsTable.position,
      cushionType: cushionOrderItemsTable.cushionType,
      quantity: cushionOrderItemsTable.quantity,
      notes: cushionOrderItemsTable.notes,
      measurementA: cushionOrderItemsTable.measurementA,
      measurementB: cushionOrderItemsTable.measurementB,
      measurementC: cushionOrderItemsTable.measurementC,
      measurementD: cushionOrderItemsTable.measurementD,
      measurementE: cushionOrderItemsTable.measurementE,
      measurementF: cushionOrderItemsTable.measurementF,
      thickness: cushionOrderItemsTable.thickness,
      productId: cushionOrderItemsTable.productId,
      productNameSnapshot: cushionOrderItemsTable.productNameSnapshot,
      productSkuSnapshot: cushionOrderItemsTable.productSkuSnapshot,
      fabricId: cushionOrderItemsTable.fabricId,
      fabricName: cushionOrderItemsTable.fabricName,
      fabricItemNumber: cushionOrderItemsTable.fabricItemNumber,
    })
    .from(cushionOrderItemsTable)
    .where(eq(cushionOrderItemsTable.orderId, id))
    .orderBy(cushionOrderItemsTable.position);
  return { order, items };
}

type DetailItems = NonNullable<Awaited<ReturnType<typeof loadDetail>>>["items"];

function serializeDetail(
  order: typeof cushionOrdersTable.$inferSelect,
  items: DetailItems,
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderKind: order.orderKind,
    status: order.status,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    fabricName: order.fabricName,
    fabricItemNumber: order.fabricItemNumber,
    contrastingFabricName: order.contrastingFabricName,
    ties: order.ties,
    seatWelt: order.seatWelt,
    backWelt: order.backWelt,
    buttons: order.buttons,
    tuft: order.tuft,
    templateAvailable: order.templateAvailable,
    customerNotes: order.customerNotes,
    agentNotes: order.agentNotes,
    submittedAt:
      order.submittedAt instanceof Date
        ? order.submittedAt.toISOString()
        : String(order.submittedAt),
    updatedAt:
      order.updatedAt instanceof Date
        ? order.updatedAt.toISOString()
        : String(order.updatedAt),
    items: items.map((it) => ({
      id: it.id,
      position: it.position,
      cushionType: it.cushionType,
      quantity: it.quantity,
      notes: it.notes,
      measurementA: it.measurementA,
      measurementB: it.measurementB,
      measurementC: it.measurementC,
      measurementD: it.measurementD,
      measurementE: it.measurementE,
      measurementF: it.measurementF,
      thickness: it.thickness,
      productId: it.productId,
      productName: it.productNameSnapshot,
      productSku: it.productSkuSnapshot,
      fabricId: it.fabricId,
      fabricName: it.fabricName,
      fabricItemNumber: it.fabricItemNumber,
    })),
  };
}

router.get(
  "/cushions/orders/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(serializeDetail(detail.order, detail.items));
  },
);

// ---------- Staff update ----------
router.patch(
  "/cushions/orders/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateCushionOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) patch["status"] = parsed.data.status;
    if (parsed.data.agentNotes !== undefined)
      patch["agentNotes"] = parsed.data.agentNotes;

    const [updated] = await db
      .update(cushionOrdersTable)
      .set(patch)
      .where(eq(cushionOrdersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const detail = await loadDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(serializeDetail(detail.order, detail.items));
  },
);

// ---------- Staff resend email ----------
router.post(
  "/cushions/orders/:id/email",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { order, items } = detail;
    if (!order.customerEmail) {
      res.status(400).json({ error: "No customer email on file" });
      return;
    }
    const summary = summarizeItems(
      items.map((it) => ({
        cushionType: it.cushionType,
        productName: it.productNameSnapshot,
        quantity: it.quantity,
      })),
    );
    try {
      await sendCustomerConfirmationEmail({
        to: order.customerEmail,
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        itemSummary: summary,
        orderKind: order.orderKind as "custom" | "stock",
      });
      res.json({ sent: true });
    } catch (err) {
      logger.error({ err, id }, "Resend cushion email failed");
      res.status(500).json({ error: "Failed to send" });
    }
  },
);

// ---------- Staff PDF ----------
router.get(
  "/cushions/orders/:id/pdf",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const productIds = detail.items
      .map((i) => i.productId)
      .filter((v): v is number => typeof v === "number");
    const productMap = new Map<number, { name: string; sku: string }>();
    if (productIds.length) {
      const rows = await db
        .select({
          id: productsTable.id,
          name: productsTable.name,
          sku: productsTable.sku,
        })
        .from(productsTable)
        .where(inArray(productsTable.id, productIds));
      for (const p of rows) productMap.set(p.id, { name: p.name, sku: p.sku });
    }
    try {
      const buf = await renderCushionOrderPdf({
        order: detail.order,
        items: detail.items,
        productNameById: productMap,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${detail.order.orderNumber}.pdf"`,
      );
      res.end(buf);
    } catch (err) {
      logger.error({ err, id }, "Cushion PDF render failed");
      res.status(500).json({ error: "Failed to render PDF" });
    }
  },
);

export default router;
