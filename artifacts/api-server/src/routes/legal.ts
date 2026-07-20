import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, legalDocumentsTable } from "@workspace/db";
import { GetLegalDocumentParams } from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

const LEGAL_TYPES = [
  "privacy_policy",
  "terms_and_conditions",
  "shipping_returns",
  "warranty",
] as const;
type LegalType = (typeof LEGAL_TYPES)[number];

router.get("/legal/:type", async (req, res): Promise<void> => {
  const params = GetLegalDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db
    .select()
    .from(legalDocumentsTable)
    .where(
      and(
        eq(legalDocumentsTable.type, params.data.type),
        eq(legalDocumentsTable.isActive, true),
      ),
    )
    .orderBy(desc(legalDocumentsTable.effectiveDate))
    .limit(1);

  if (!doc) {
    res.status(404).json({ error: "No active legal document found" });
    return;
  }

  if (!LEGAL_TYPES.includes(doc.type as LegalType)) {
    req.log.error(
      { type: doc.type, id: doc.id },
      "legal_documents.type contains an unrecognized value",
    );
    res.status(500).json({ error: "Invalid legal document type in storage" });
    return;
  }

  res.json({
    id: doc.id,
    type: doc.type as LegalType,
    version: doc.version,
    content: doc.content,
    effectiveDate: doc.effectiveDate,
    pdfStorageUrl: toPublicImageUrl(doc.pdfStorageUrl),
  });
});

// Stable per-type PDF redirect URLs: GET /legal/:type/pdf
// 302s to the active version's served PDF. Falls back to the in-site text
// route when the active row has no PDF (text-era environment).
const INSITE_ROUTES: Record<LegalType, string> = {
  privacy_policy: "/privacy-policy",
  terms_and_conditions: "/terms-and-conditions",
  shipping_returns: "/shipping-returns",
  warranty: "/warranty",
};

router.get("/legal/:type/pdf", async (req, res): Promise<void> => {
  const params = GetLegalDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const type = params.data.type as LegalType;

  const [doc] = await db
    .select()
    .from(legalDocumentsTable)
    .where(
      and(
        eq(legalDocumentsTable.type, type),
        eq(legalDocumentsTable.isActive, true),
      ),
    )
    .orderBy(desc(legalDocumentsTable.effectiveDate))
    .limit(1);

  if (!doc || !doc.pdfStorageUrl) {
    // No active doc, or active doc is text-era: send to in-site text renderer.
    res.redirect(302, INSITE_ROUTES[type]);
    return;
  }

  res.redirect(302, toPublicImageUrl(doc.pdfStorageUrl)!);
});

export default router;
