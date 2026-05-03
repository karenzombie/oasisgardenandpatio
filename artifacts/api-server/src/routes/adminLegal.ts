import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, legalDocumentsTable, type LegalDocument } from "@workspace/db";
import {
  AdminListLegalVersionsParams,
  AdminCreateLegalVersionParams,
  AdminCreateLegalVersionBody,
  AdminRestoreLegalVersionParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

type LegalType = "privacy_policy" | "terms_and_conditions";

function toPayload(row: LegalDocument) {
  return {
    id: row.id,
    type: row.type as LegalType,
    version: row.version,
    content: row.content,
    effectiveDate: row.effectiveDate,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateToString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function todayDateString(): string {
  return dateToString(new Date());
}

async function nextVersion(type: LegalType): Promise<string> {
  const rows = await db
    .select({ version: legalDocumentsTable.version })
    .from(legalDocumentsTable)
    .where(eq(legalDocumentsTable.type, type));
  let maxN = 0;
  for (const r of rows) {
    const m = /^v(\d+)$/i.exec(r.version);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `v${maxN + 1}`;
}

router.get(
  "/admin/legal/:type",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListLegalVersionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const rows = await db
      .select()
      .from(legalDocumentsTable)
      .where(eq(legalDocumentsTable.type, params.data.type))
      .orderBy(
        desc(legalDocumentsTable.isActive),
        desc(legalDocumentsTable.effectiveDate),
        desc(legalDocumentsTable.id),
      );
    res.json(rows.map(toPayload));
  },
);

router.post(
  "/admin/legal/:type",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCreateLegalVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const body = AdminCreateLegalVersionBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const type = params.data.type;
    const effectiveDate = body.data.effectiveDate
      ? dateToString(body.data.effectiveDate)
      : todayDateString();
    const version =
      body.data.version && body.data.version.trim().length > 0
        ? body.data.version.trim()
        : await nextVersion(type);

    try {
      const created = await db.transaction(async (tx) => {
        await tx
          .update(legalDocumentsTable)
          .set({ isActive: false })
          .where(
            and(
              eq(legalDocumentsTable.type, type),
              eq(legalDocumentsTable.isActive, true),
            ),
          );
        const [row] = await tx
          .insert(legalDocumentsTable)
          .values({
            type,
            version,
            content: body.data.content,
            effectiveDate,
            isActive: true,
          })
          .returning();
        if (!row) throw new Error("Insert returned no row");
        return row;
      });
      await recordHistory(req, {
        entityType: "legal_document",
        entityId: created.id,
        changeType: "create",
        snapshot: created,
        notes: `published ${type} ${created.version}`,
      });
      res.status(201).json(toPayload(created));
    } catch (err) {
      req.log.error({ err }, "Failed to publish legal version");
      res.status(500).json({ error: "Failed to publish version" });
    }
  },
);

router.post(
  "/admin/legal/:type/:id/restore",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminRestoreLegalVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const { type, id } = params.data;
    try {
      const restored = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(legalDocumentsTable)
          .where(
            and(
              eq(legalDocumentsTable.id, id),
              eq(legalDocumentsTable.type, type),
            ),
          )
          .limit(1);
        if (!target) return null;
        await tx
          .update(legalDocumentsTable)
          .set({ isActive: false })
          .where(
            and(
              eq(legalDocumentsTable.type, type),
              eq(legalDocumentsTable.isActive, true),
            ),
          );
        const [row] = await tx
          .update(legalDocumentsTable)
          .set({ isActive: true })
          .where(eq(legalDocumentsTable.id, id))
          .returning();
        return row ?? null;
      });
      if (!restored) {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      await recordHistory(req, {
        entityType: "legal_document",
        entityId: restored.id,
        changeType: "update",
        snapshot: restored,
        notes: `restored ${type} ${restored.version} as active`,
      });
      res.json(toPayload(restored));
    } catch (err) {
      req.log.error({ err }, "Failed to restore legal version");
      res.status(500).json({ error: "Failed to restore version" });
    }
  },
);

export default router;
