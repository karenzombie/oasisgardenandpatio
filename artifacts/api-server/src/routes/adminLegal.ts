import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq } from "drizzle-orm";
import { db, legalDocumentsTable, type LegalDocument } from "@workspace/db";
import {
  AdminListLegalVersionsParams,
  AdminRestoreLegalVersionParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";
import { uploadBufferToPublicStorage } from "../lib/objectStorage";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
});

type LegalType =
  | "privacy_policy"
  | "terms_and_conditions"
  | "shipping_returns"
  | "warranty";

function toPayload(row: LegalDocument) {
  return {
    id: row.id,
    type: row.type as LegalType,
    version: row.version,
    content: row.content,
    effectiveDate: row.effectiveDate,
    isActive: row.isActive,
    pdfStorageUrl: toPublicImageUrl(row.pdfStorageUrl),
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

// GET /admin/legal/:type — list all versions
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

// POST /admin/legal/:type/upload — upload a PDF and publish it as the new active version.
// Accepts multipart/form-data with fields: file (required), version (optional), effectiveDate (optional).
// Rejects uploads whose extension is not .pdf or whose MIME type is not application/pdf.
router.post(
  "/admin/legal/:type/upload",
  requireAuth,
  requireRole("admin"),
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListLegalVersionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const type = params.data.type;

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    if (!file.originalname.toLowerCase().endsWith(".pdf")) {
      res.status(400).json({ error: "Only PDF files are accepted (wrong extension)" });
      return;
    }
    if (file.mimetype !== "application/pdf") {
      res.status(400).json({ error: "Only PDF files are accepted (wrong content type)" });
      return;
    }

    const rawVersion =
      typeof req.body.version === "string" ? req.body.version.trim() : "";
    const rawDate =
      typeof req.body.effectiveDate === "string"
        ? req.body.effectiveDate.trim()
        : "";
    const effectiveDate = rawDate || todayDateString();
    const version =
      rawVersion.length > 0 ? rawVersion : await nextVersion(type);

    try {
      const pdfStorageUrl = await uploadBufferToPublicStorage(
        file.buffer,
        "application/pdf",
        "legal-docs",
      );

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
            content: "",
            effectiveDate,
            isActive: true,
            pdfStorageUrl,
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
        notes: `published PDF ${type} ${created.version}`,
      });

      res.status(201).json(toPayload(created));
    } catch (err) {
      req.log.error({ err }, "Failed to publish legal PDF version");
      res.status(500).json({ error: "Failed to publish version" });
    }
  },
);

// POST /admin/legal/:type/:id/restore — restore a prior PDF version as the active one.
// Blocked for text-era rows (those without a pdf_storage_url).
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
      const result = await db.transaction(async (tx) => {
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
        if (!target) return { kind: "not_found" } as const;
        if (!target.pdfStorageUrl) return { kind: "text_era" } as const;

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
        return { kind: "ok", row: row ?? null } as const;
      });

      if (result.kind === "not_found") {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      if (result.kind === "text_era") {
        res
          .status(422)
          .json({
            error:
              "Text-era versions cannot be restored. Only PDF versions are restorable.",
          });
        return;
      }
      if (!result.row) {
        res.status(404).json({ error: "Version not found" });
        return;
      }

      await recordHistory(req, {
        entityType: "legal_document",
        entityId: result.row.id,
        changeType: "update",
        snapshot: result.row,
        notes: `restored ${type} ${result.row.version} as active`,
      });
      res.json(toPayload(result.row));
    } catch (err) {
      req.log.error({ err }, "Failed to restore legal version");
      res.status(500).json({ error: "Failed to restore version" });
    }
  },
);

export default router;
