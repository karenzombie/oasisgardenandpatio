import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, carriersTable, type Carrier } from "@workspace/db";
import {
  AdminCreateCarrierBody,
  AdminUpdateCarrierParams,
  AdminUpdateCarrierBody,
  AdminSetCarrierActiveParams,
  AdminSetCarrierActiveBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

function carrierToPayload(row: Carrier) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    trackingUrlTemplate: row.trackingUrlTemplate,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

router.get(
  "/admin/carriers",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(carriersTable)
      .orderBy(desc(carriersTable.isActive), asc(carriersTable.name));
    res.json(rows.map(carrierToPayload));
  },
);

router.post(
  "/admin/carriers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateCarrierBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { name, code, contactName, contactPhone, contactEmail, trackingUrlTemplate, isActive } =
      parsed.data;
    try {
      const [created] = await db
        .insert(carriersTable)
        .values({
          name: name.trim(),
          code: nullify(code),
          contactName: nullify(contactName),
          contactPhone: nullify(contactPhone),
          contactEmail: nullify(contactEmail),
          trackingUrlTemplate: nullify(trackingUrlTemplate),
          isActive: isActive ?? true,
        })
        .returning();
      if (!created) {
        res.status(500).json({ error: "Insert returned no row" });
        return;
      }
      await recordHistory(req, {
        entityType: "carrier",
        entityId: created.id,
        changeType: "create",
        snapshot: created,
      });
      res.status(201).json(carrierToPayload(created));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Carrier code already in use" });
        return;
      }
      throw err;
    }
  },
);

router.put(
  "/admin/carriers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateCarrierParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateCarrierBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const [previous] = await db
      .select()
      .from(carriersTable)
      .where(eq(carriersTable.id, params.data.id));
    try {
      const [updated] = await db
        .update(carriersTable)
        .set({
          name: body.data.name.trim(),
          code: nullify(body.data.code),
          contactName: nullify(body.data.contactName),
          contactPhone: nullify(body.data.contactPhone),
          contactEmail: nullify(body.data.contactEmail),
          trackingUrlTemplate: nullify(body.data.trackingUrlTemplate),
        })
        .where(eq(carriersTable.id, params.data.id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Carrier not found" });
        return;
      }
      await recordHistory(req, {
        entityType: "carrier",
        entityId: updated.id,
        changeType: "update",
        snapshot: updated,
        previousSnapshot: previous ?? null,
      });
      res.json(carrierToPayload(updated));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Carrier code already in use" });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/admin/carriers/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetCarrierActiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminSetCarrierActiveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const [previous] = await db
      .select()
      .from(carriersTable)
      .where(eq(carriersTable.id, params.data.id));
    const [updated] = await db
      .update(carriersTable)
      .set({ isActive: body.data.isActive })
      .where(eq(carriersTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "carrier",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous ?? null,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(carrierToPayload(updated));
  },
);

export default router;
