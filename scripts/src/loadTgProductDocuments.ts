/**
 * Load Treasure Garden product PDFs into App Storage and link them from the
 * products.specs JSON object.
 *
 * Source of truth:
 *   - attached_assets/index_with_skus_1787792745544.csv
 *   - treasure_garden_product_documents/
 *
 * The loader is intentionally development-only. It validates every CSV row,
 * uploads each unique PDF once, and then merges labelled PDF links into the
 * existing specs without removing any existing specification values.
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import Papa from "papaparse";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  manufacturersTable,
  pool,
  productsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(
  __dirname,
  "../../attached_assets/index_with_skus_1787792745544.csv",
);
const DOCUMENTS_DIR = resolve(
  __dirname,
  "../../treasure_garden_product_documents",
);
const STORAGE_SUBDIR = "tg-product-documents";
const MANUFACTURER_NAME = "Treasure Garden";

type DocumentRow = {
  db_sku: string;
  db_name: string;
  db_category: string;
  match_basis: string;
  tg_page: string;
  document_label: string;
  filename: string;
  product_url: string;
  folder: string;
};

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  specs: unknown;
};

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function required(value: string | undefined, field: string, rowNumber: number) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`CSV row ${rowNumber}: ${field} is blank`);
  }
  return trimmed;
}

function objectPathFor(filename: string): string {
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

function publicUrlFor(filename: string): string {
  return `/api/storage${objectPathFor(filename)}`;
}

function splitBucketPath(fullPath: string) {
  const parts = fullPath.replace(/^\/+/, "").split("/");
  const bucketName = parts.shift();
  if (!bucketName || parts.length === 0) {
    throw new Error(`Invalid object storage path: ${fullPath}`);
  }
  return { bucketName, objectName: parts.join("/") };
}

async function uploadPdf(filename: string): Promise<void> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR is not set");
  }

  const fullPath = `${privateDir.replace(/\/+$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = splitBucketPath(fullPath);
  const file = storage.bucket(bucketName).file(objectName);
  const buffer = await readFile(join(DOCUMENTS_DIR, filename));
  await file.save(buffer, {
    contentType: "application/pdf",
    resumable: false,
  });
}

function parseRows(csvText: string): DocumentRow[] {
  const parsed = Papa.parse<DocumentRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parsing failed: ${parsed.errors
        .map((error) => `${error.message} at row ${error.row}`)
        .join("; ")}`,
    );
  }

  const requiredColumns = [
    "db_sku",
    "document_label",
    "filename",
  ] as const;
  for (const column of requiredColumns) {
    if (!parsed.meta.fields?.includes(column)) {
      throw new Error(`CSV is missing required column "${column}"`);
    }
  }

  return parsed.data.map((raw, index) => {
    const rowNumber = index + 2;
    return {
      db_sku: required(raw.db_sku, "db_sku", rowNumber),
      db_name: required(raw.db_name, "db_name", rowNumber),
      db_category: required(raw.db_category, "db_category", rowNumber),
      match_basis: required(raw.match_basis, "match_basis", rowNumber),
      tg_page: required(raw.tg_page, "tg_page", rowNumber),
      document_label: required(raw.document_label, "document_label", rowNumber),
      filename: required(raw.filename, "filename", rowNumber),
      product_url: required(raw.product_url, "product_url", rowNumber),
      folder: required(raw.folder, "folder", rowNumber),
    };
  });
}

function validateCsvMappings(rows: DocumentRow[], availableFiles: Set<string>) {
  const seenProductLabels = new Map<string, string>();
  const referencedFiles = new Set<string>();

  for (const row of rows) {
    if (basename(row.filename) !== row.filename) {
      throw new Error(`Refusing path-like PDF filename: ${row.filename}`);
    }
    if (!row.filename.toLowerCase().endsWith(".pdf")) {
      throw new Error(`CSV document is not a PDF: ${row.filename}`);
    }
    if (!availableFiles.has(row.filename)) {
      throw new Error(`CSV references missing PDF: ${row.filename}`);
    }

    const productLabelKey = `${row.db_sku}\u0000${row.document_label}`;
    const previousFilename = seenProductLabels.get(productLabelKey);
    if (previousFilename && previousFilename !== row.filename) {
      throw new Error(
        `SKU ${row.db_sku} maps label "${row.document_label}" to both ` +
          `${previousFilename} and ${row.filename}`,
      );
    }
    seenProductLabels.set(productLabelKey, row.filename);
    referencedFiles.add(row.filename);
  }

  return referencedFiles;
}

async function main() {
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.ALLOW_PROD === "1") {
    throw new Error(
      "This loader is development-only and refuses production database targets.",
    );
  }

  const csvText = (await readFile(CSV_PATH)).toString("utf8");
  const rows = parseRows(csvText);
  const availableFiles = new Set(
    (await readdir(DOCUMENTS_DIR)).filter((filename) =>
      filename.toLowerCase().endsWith(".pdf"),
    ),
  );
  const referencedFiles = validateCsvMappings(rows, availableFiles);
  const uniqueRows = [
    ...new Map(
      rows.map((row) => [
        `${row.db_sku}\u0000${row.document_label}\u0000${row.filename}`,
        row,
      ]),
    ).values(),
  ];
  const skus = [...new Set(rows.map((row) => row.db_sku))];

  const [manufacturer] = await db
    .select({ id: manufacturersTable.id, name: manufacturersTable.name })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME));
  if (!manufacturer) {
    throw new Error(`Manufacturer not found: ${MANUFACTURER_NAME}`);
  }

  const products = await db
    .select({
      id: productsTable.id,
      sku: productsTable.sku,
      name: productsTable.name,
      specs: productsTable.specs,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.manufacturerId, manufacturer.id),
        inArray(productsTable.sku, skus),
      ),
    );
  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const missingSkus = skus.filter((sku) => !productsBySku.has(sku));
  if (missingSkus.length > 0) {
    throw new Error(
      `CSV SKUs missing from ${MANUFACTURER_NAME}: ${missingSkus.join(", ")}`,
    );
  }

  const rowsBySku = new Map<string, DocumentRow[]>();
  for (const row of uniqueRows) {
    const existing = rowsBySku.get(row.db_sku) ?? [];
    existing.push(row);
    rowsBySku.set(row.db_sku, existing);
  }

  const updates = products.map((product) => {
    const productRows = rowsBySku.get(product.sku) ?? [];
    const existingSpecs =
      product.specs === null || product.specs === undefined
        ? {}
        : typeof product.specs === "object" && !Array.isArray(product.specs)
          ? { ...(product.specs as Record<string, unknown>) }
          : null;
    if (!existingSpecs) {
      throw new Error(
        `Product ${product.sku} has non-object specs; refusing to overwrite it.`,
      );
    }

    for (const row of productRows) {
      const url = publicUrlFor(row.filename);
      const previous = existingSpecs[row.document_label];
      if (previous !== undefined && previous !== url) {
        throw new Error(
          `Product ${product.sku} already has a different value for ` +
            `"${row.document_label}"; refusing to overwrite it.`,
        );
      }
      existingSpecs[row.document_label] = url;
    }

    return { product, specs: existingSpecs, documentCount: productRows.length };
  });

  console.log(
    `Validated ${rows.length} CSV rows (${uniqueRows.length} unique associations) ` +
      `across ${skus.length} products and ${referencedFiles.size} unique PDFs.`,
  );
  console.log(`Uploading PDFs to App Storage under /${STORAGE_SUBDIR}/ ...`);
  for (const filename of referencedFiles) {
    await uploadPdf(filename);
    console.log(`  ✓ ${filename}`);
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(productsTable)
        .set({ specs: update.specs })
        .where(eq(productsTable.id, update.product.id));
    }
  });

  console.log(
    `Updated ${updates.length} development products with ` +
      `${uniqueRows.length} labelled PDF links.`,
  );
  console.log("✅ Treasure Garden product documents loaded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });