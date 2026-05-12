import { Router, type IRouter, type Request, type Response } from "express";
import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  inventoryTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";
import {
  AdminImportProductsDryRunBody,
  AdminImportProductsCommitBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

type Mapping = {
  name: string;
  sku: string;
  manufacturer: string;
  category: string;
  price: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  cost?: string;
  weight?: string;
  dimensions?: string;
  onHand?: string;
  reorderThreshold?: string;
  featured?: string;
  availableOnline?: string;
  inStoreOnly?: string;
};

type RowError = { field: string; message: string };

type ParsedRow = {
  rowIndex: number;
  raw: Record<string, string>;
  errors: RowError[];
  // parsed values (only set if no critical errors)
  name?: string;
  slug?: string;
  sku?: string;
  manufacturerId?: number;
  categoryId?: number;
  shortDescription?: string | null;
  description?: string | null;
  price?: string;
  cost?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  onHand?: number;
  reorderThreshold?: number;
  featured?: boolean;
  availableOnline?: boolean;
  inStoreOnly?: boolean;
  existingProductId?: number | null;
  action: "create" | "update" | "error";
};

const TRUTHY = new Set(["true", "yes", "y", "1", "t"]);
const FALSY = new Set(["false", "no", "n", "0", "f", ""]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDecimal(
  raw: string | undefined,
  field: string,
  required: boolean,
): { value: string | null; error: RowError | null } {
  const v = (raw ?? "").trim();
  if (!v) {
    if (required) return { value: null, error: { field, message: "Required" } };
    return { value: null, error: null };
  }
  // Strip $ and commas
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { value: null, error: { field, message: `Not a number: "${v}"` } };
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) {
    return { value: null, error: { field, message: `Must be >= 0: "${v}"` } };
  }
  return { value: cleaned, error: null };
}

function parseInt0(
  raw: string | undefined,
  field: string,
): { value: number; error: RowError | null } {
  const v = (raw ?? "").trim();
  if (!v) return { value: 0, error: null };
  const cleaned = v.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return { value: 0, error: { field, message: `Not an integer: "${v}"` } };
  }
  return { value: Number.parseInt(cleaned, 10), error: null };
}

function parseBool(
  raw: string | undefined,
  field: string,
  defaultVal: boolean,
): { value: boolean; error: RowError | null } {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return { value: defaultVal, error: null };
  if (TRUTHY.has(v)) return { value: true, error: null };
  if (FALSY.has(v)) return { value: false, error: null };
  return {
    value: defaultVal,
    error: { field, message: `Not a boolean: "${v}" (expected true/false)` },
  };
}

function get(
  row: Record<string, string>,
  column: string | undefined,
): string | undefined {
  if (!column) return undefined;
  // Headers are matched as Papa.parse parsed them (trimmed by transformHeader).
  return row[column];
}

async function loadAndValidate(
  csvText: string,
  mapping: Mapping,
  log: Request["log"],
): Promise<{
  parsedRows: ParsedRow[];
  parseError: string | null;
}> {
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parseResult.errors.length > 0) {
    const first = parseResult.errors[0];
    return {
      parsedRows: [],
      parseError: `CSV parse error on row ${first?.row ?? "?"}: ${first?.message ?? "unknown"}`,
    };
  }
  const headers = parseResult.meta.fields ?? [];
  // Defense-in-depth: reject any mapping that targets a CSV header whose name
  // would resolve to a dangerous JS prototype property. The validation loop
  // uses `Object.prototype.hasOwnProperty` lookups on plain objects produced
  // by Papa Parse, but bad header names could still be returned to the UI in
  // error messages or fed elsewhere — block them up front.
  const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);
  for (const h of headers) {
    if (DANGEROUS.has(h)) {
      return {
        parsedRows: [],
        parseError: `CSV header "${h}" is not allowed`,
      };
    }
  }
  for (const v of Object.values(mapping)) {
    if (typeof v === "string" && DANGEROUS.has(v)) {
      return {
        parsedRows: [],
        parseError: `Mapping value "${v}" is not allowed`,
      };
    }
  }
  const requiredColumns: Array<keyof Mapping> = [
    "name",
    "sku",
    "manufacturer",
    "category",
    "price",
  ];
  for (const f of requiredColumns) {
    const col = mapping[f];
    if (!col) {
      return {
        parsedRows: [],
        parseError: `Mapping missing required field "${f}"`,
      };
    }
    if (!headers.includes(col)) {
      return {
        parsedRows: [],
        parseError: `CSV does not contain column "${col}" (mapped to "${f}")`,
      };
    }
  }
  // Optional columns: warn-only at parse stage; if user mapped a missing
  // column we just treat it as absent (no per-row value).
  const rows = parseResult.data;
  if (rows.length === 0) {
    return { parsedRows: [], parseError: "CSV contains no data rows" };
  }

  // Pre-load manufacturers & categories for fast name resolution (case-insensitive).
  const [allMfgs, allCats] = await Promise.all([
    db.select({ id: manufacturersTable.id, name: manufacturersTable.name }).from(manufacturersTable),
    db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable),
  ]);
  const mfgByName = new Map<string, number>();
  for (const m of allMfgs) mfgByName.set(m.name.toLowerCase().trim(), m.id);
  const catByName = new Map<string, number>();
  for (const c of allCats) catByName.set(c.name.toLowerCase().trim(), c.id);

  const parsedRows: ParsedRow[] = [];
  // Collect all SKUs we'll see, query existing in one go.
  const seenSkus = new Set<string>();
  for (const raw of rows) {
    const sku = (get(raw, mapping.sku) ?? "").trim();
    if (sku) seenSkus.add(sku);
  }
  const existingBySku = new Map<string, number>();
  if (seenSkus.size > 0) {
    const existing = await db
      .select({ id: productsTable.id, sku: productsTable.sku })
      .from(productsTable)
      .where(
        sql`${productsTable.sku} IN (${sql.join(
          [...seenSkus].map((s) => sql`${s}`),
          sql`,`,
        )})`,
      );
    for (const e of existing) existingBySku.set(e.sku, e.id);
  }

  // Track duplicate SKUs WITHIN the file so we can flag the second+ occurrence.
  const skusSeenInFile = new Set<string>();
  const slugsSeenInFile = new Set<string>();

  rows.forEach((raw, idx) => {
    const rowIndex = idx + 1; // 1-based, excluding header
    const errors: RowError[] = [];
    const name = (get(raw, mapping.name) ?? "").trim();
    if (!name) errors.push({ field: "name", message: "Required" });
    const sku = (get(raw, mapping.sku) ?? "").trim();
    if (!sku) errors.push({ field: "sku", message: "Required" });
    if (sku && skusSeenInFile.has(sku)) {
      errors.push({
        field: "sku",
        message: `Duplicate SKU within file: "${sku}"`,
      });
    } else if (sku) {
      skusSeenInFile.add(sku);
    }

    let slug = (get(raw, mapping.slug) ?? "").trim();
    if (!slug && name) slug = slugify(name);
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.push({
        field: "slug",
        message: `Invalid slug: "${slug}" (lowercase letters, digits, hyphens)`,
      });
    }
    if (slug && slugsSeenInFile.has(slug)) {
      errors.push({
        field: "slug",
        message: `Duplicate slug within file: "${slug}"`,
      });
    } else if (slug) {
      slugsSeenInFile.add(slug);
    }

    const mfgRaw = (get(raw, mapping.manufacturer) ?? "").trim();
    let manufacturerId: number | undefined;
    if (!mfgRaw) {
      errors.push({ field: "manufacturer", message: "Required" });
    } else {
      const id = mfgByName.get(mfgRaw.toLowerCase());
      if (!id) {
        errors.push({
          field: "manufacturer",
          message: `Unknown manufacturer: "${mfgRaw}" (create it first)`,
        });
      } else {
        manufacturerId = id;
      }
    }

    const catRaw = (get(raw, mapping.category) ?? "").trim();
    let categoryId: number | undefined;
    if (!catRaw) {
      errors.push({ field: "category", message: "Required" });
    } else {
      const id = catByName.get(catRaw.toLowerCase());
      if (!id) {
        errors.push({
          field: "category",
          message: `Unknown category: "${catRaw}" (create it first)`,
        });
      } else {
        categoryId = id;
      }
    }

    const priceP = parseDecimal(get(raw, mapping.price), "price", true);
    if (priceP.error) errors.push(priceP.error);
    const costP = parseDecimal(get(raw, mapping.cost), "cost", false);
    if (costP.error) errors.push(costP.error);
    const weightP = parseDecimal(get(raw, mapping.weight), "weight", false);
    if (weightP.error) errors.push(weightP.error);
    const onHandP = parseInt0(get(raw, mapping.onHand), "onHand");
    if (onHandP.error) errors.push(onHandP.error);
    const reorderP = parseInt0(
      get(raw, mapping.reorderThreshold),
      "reorderThreshold",
    );
    if (reorderP.error) errors.push(reorderP.error);
    const featuredP = parseBool(
      get(raw, mapping.featured),
      "featured",
      false,
    );
    if (featuredP.error) errors.push(featuredP.error);
    const availOnlineP = parseBool(
      get(raw, mapping.availableOnline),
      "availableOnline",
      true,
    );
    if (availOnlineP.error) errors.push(availOnlineP.error);
    const inStoreP = parseBool(
      get(raw, mapping.inStoreOnly),
      "inStoreOnly",
      false,
    );
    if (inStoreP.error) errors.push(inStoreP.error);

    const existingId = sku ? existingBySku.get(sku) ?? null : null;

    const action: ParsedRow["action"] =
      errors.length > 0 ? "error" : existingId ? "update" : "create";

    parsedRows.push({
      rowIndex,
      raw,
      errors,
      name: errors.length === 0 ? name : undefined,
      slug: errors.length === 0 ? slug : undefined,
      sku: errors.length === 0 ? sku : undefined,
      manufacturerId: errors.length === 0 ? manufacturerId : undefined,
      categoryId: errors.length === 0 ? categoryId : undefined,
      shortDescription:
        errors.length === 0
          ? (get(raw, mapping.shortDescription) ?? "").trim() || null
          : undefined,
      description:
        errors.length === 0
          ? (get(raw, mapping.description) ?? "").trim() || null
          : undefined,
      price: errors.length === 0 ? (priceP.value ?? "0") : undefined,
      cost: errors.length === 0 ? costP.value : undefined,
      weight: errors.length === 0 ? weightP.value : undefined,
      dimensions:
        errors.length === 0
          ? (get(raw, mapping.dimensions) ?? "").trim() || null
          : undefined,
      onHand: errors.length === 0 ? onHandP.value : undefined,
      reorderThreshold: errors.length === 0 ? reorderP.value : undefined,
      featured: errors.length === 0 ? featuredP.value : undefined,
      availableOnline: errors.length === 0 ? availOnlineP.value : undefined,
      inStoreOnly: errors.length === 0 ? inStoreP.value : undefined,
      existingProductId: existingId,
      action,
    });
  });

  log.debug({ rowCount: parsedRows.length }, "CSV import parsed");
  return { parsedRows, parseError: null };
}

function rowToReportPayload(r: ParsedRow) {
  return {
    rowIndex: r.rowIndex,
    action: r.action,
    sku: r.sku ?? null,
    name: r.name ?? null,
    existingProductId: r.existingProductId ?? null,
    errors: r.errors,
  };
}

router.post(
  "/admin/products/import/dry-run",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminImportProductsDryRunBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { csvText, mapping } = parsed.data;
    const { parsedRows, parseError } = await loadAndValidate(
      csvText,
      mapping as Mapping,
      req.log,
    );
    if (parseError) {
      res.status(400).json({ error: parseError });
      return;
    }
    const willCreateCount = parsedRows.filter((r) => r.action === "create").length;
    const willUpdateCount = parsedRows.filter((r) => r.action === "update").length;
    const errorCount = parsedRows.filter((r) => r.action === "error").length;
    res.json({
      totalRows: parsedRows.length,
      willCreateCount,
      willUpdateCount,
      errorCount,
      rows: parsedRows.map(rowToReportPayload),
    });
  },
);

router.post(
  "/admin/products/import/commit",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminImportProductsCommitBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { csvText, mapping } = parsed.data;
    const { parsedRows, parseError } = await loadAndValidate(
      csvText,
      mapping as Mapping,
      req.log,
    );
    if (parseError) {
      res.status(400).json({ error: parseError });
      return;
    }
    const blockingErrors = parsedRows.filter((r) => r.action === "error");
    if (blockingErrors.length > 0) {
      res.status(400).json({
        error: `Cannot commit: ${blockingErrors.length} row(s) have errors. Run dry-run and fix.`,
      });
      return;
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors: ReturnType<typeof rowToReportPayload>[] = [];
    const historyOps: Array<{
      productId: number;
      changeType: "create" | "update";
    }> = [];

    try {
      await db.transaction(async (tx) => {
        for (const r of parsedRows) {
          try {
            if (r.action === "create") {
              const [created] = await tx
                .insert(productsTable)
                .values({
                  name: r.name!,
                  slug: r.slug!,
                  sku: r.sku!,
                  description: r.description ?? null,
                  shortDescription: r.shortDescription ?? null,
                  manufacturerId: r.manufacturerId!,
                  categoryId: r.categoryId!,
                  materialId: null,
                  price: r.price!,
                  cost: r.cost ?? null,
                  weight: r.weight ?? null,
                  dimensions: r.dimensions ?? null,
                  showPriceOnline: true,
                  availableOnline: r.availableOnline!,
                  inStoreOnly: r.inStoreOnly!,
                  featured: r.featured!,
                  displayOrder: 0,
                  lowStockThreshold: 0,
                  isActive: true,
                })
                .returning({ id: productsTable.id });
              if (!created) throw new Error("Insert returned nothing");
              await tx.insert(inventoryTable).values({
                productId: created.id,
                onHand: r.onHand!,
                onHold: 0,
                reorderThreshold: r.reorderThreshold!,
              });
              createdCount += 1;
              historyOps.push({ productId: created.id, changeType: "create" });
            } else if (r.action === "update" && r.existingProductId) {
              await tx
                .update(productsTable)
                .set({
                  name: r.name!,
                  slug: r.slug!,
                  description: r.description ?? null,
                  shortDescription: r.shortDescription ?? null,
                  manufacturerId: r.manufacturerId!,
                  categoryId: r.categoryId!,
                  price: r.price!,
                  cost: r.cost ?? null,
                  weight: r.weight ?? null,
                  dimensions: r.dimensions ?? null,
                  availableOnline: r.availableOnline!,
                  inStoreOnly: r.inStoreOnly!,
                  featured: r.featured!,
                  updatedAt: new Date(),
                })
                .where(eq(productsTable.id, r.existingProductId));
              // Upsert inventory atomically — avoids a select-then-insert race
              // that could unique-violate under concurrent imports and abort
              // the whole batch.
              await tx
                .insert(inventoryTable)
                .values({
                  productId: r.existingProductId,
                  onHand: r.onHand!,
                  onHold: 0,
                  reorderThreshold: r.reorderThreshold!,
                })
                .onConflictDoUpdate({
                  target: [
                    inventoryTable.productId,
                    inventoryTable.variantId,
                    inventoryTable.fabricId,
                  ],
                  set: {
                    onHand: r.onHand!,
                    reorderThreshold: r.reorderThreshold!,
                    updatedAt: new Date(),
                  },
                });
              updatedCount += 1;
              historyOps.push({
                productId: r.existingProductId,
                changeType: "update",
              });
            }
          } catch (err) {
            const msg = isUniqueViolation(err)
              ? `Duplicate slug or SKU at DB level for "${r.sku}"`
              : err instanceof Error
                ? err.message
                : "Unknown error";
            errors.push({
              rowIndex: r.rowIndex,
              action: "error" as const,
              sku: r.sku ?? null,
              name: r.name ?? null,
              existingProductId: r.existingProductId ?? null,
              errors: [{ field: "_row", message: msg }],
            });
            // Abort the entire transaction so we don't end up with a partial commit.
            throw err;
          }
        }
      });
    } catch (err) {
      req.log.error({ err }, "Import commit failed; rolled back");
      res.status(400).json({
        error:
          errors.length > 0
            ? `Import failed at row ${errors[0]!.rowIndex}: ${errors[0]!.errors[0]?.message ?? "unknown"}. All changes rolled back.`
            : err instanceof Error
              ? err.message
              : "Import failed",
      });
      return;
    }

    if (historyOps.length > 0) {
      const ids = historyOps.map((o) => o.productId);
      const rows = await db
        .select()
        .from(productsTable)
        .where(
          sql`${productsTable.id} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`,`,
          )})`,
        );
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const op of historyOps) {
        const row = byId.get(op.productId);
        if (!row) continue;
        await recordHistory(req, {
          entityType: "product",
          entityId: op.productId,
          changeType: op.changeType,
          snapshot: row,
          notes: `CSV import ${op.changeType}`,
        });
      }
    }

    res.json({
      totalRows: parsedRows.length,
      createdCount,
      updatedCount,
      errorCount: 0,
      errors: [],
    });
  },
);

export default router;
