/**
 * Seed Couture Jardin products from CSV + local images.
 *
 * Images live at: couture_jardin_images/{COLLECTION}/{SKU}.jpg
 * Each CSV row → one standalone product (no variant grouping).
 * Run on dev first, then prod (set DATABASE_URL accordingly).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/seedCoutureJardinProducts.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  productsTable,
  productImagesTable,
  inventoryTable,
  categoriesTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/couture_jardin_products_1780107087804.csv",
);
const LOCAL_IMAGE_DIR = join(WORKSPACE_ROOT, "couture_jardin_images");
const MANUFACTURER_SLUG = "couture-jardin";
const STORAGE_SUBDIR = "products/couture-jardin";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ---------------------------------------------------------------------------
// Categories: map CSV "category" → DB category name (create if missing)
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  Seating: "Deep Seating",
  Dining: "Dining",
  Chaises: "Chaise Lounges",
  "Coffee Side Tables": "Coffee & Side Tables",
  Bar: "Bar",
  Daybeds: "Daybeds",
  "Accent Pieces": "Accent Pieces",
};

// New categories that need to be created with these slugs
const NEW_CATEGORIES: Array<{ name: string; slug: string; displayOrder: number }> = [
  { name: "Coffee & Side Tables", slug: "cat-coffee-side-tables", displayOrder: 10 },
  { name: "Bar", slug: "cat-bar", displayOrder: 11 },
  { name: "Daybeds", slug: "cat-daybeds", displayOrder: 12 },
  { name: "Accent Pieces", slug: "cat-accent-pieces", displayOrder: 13 },
];

// ---------------------------------------------------------------------------
// Object Storage
// ---------------------------------------------------------------------------

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  storageFilename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageFilename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageFilename}`;
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sanitize a string to ASCII-safe characters for use as a filename/path. */
function toAsciiSafe(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")   // strip non-ASCII (handles Cyrillic С → "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n++}`;
  }
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

type CsvRow = {
  name: string;
  sku: string;
  collection: string;
  category: string;
  width: string;
  depth: string;
  height: string;
  seat_height: string;
  arm_height: string;
  fabrics: string;
  finishes: string;
  frame_materials: string;
  additional_colors: string;
  description: string;
  tags: string;
  image_url: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Build specs JSON from dimensional fields
// ---------------------------------------------------------------------------

function buildSpecs(row: CsvRow): Record<string, string> {
  const specs: Record<string, string> = {};
  if (row.width?.trim()) specs["Width"] = row.width.trim();
  if (row.depth?.trim()) specs["Depth"] = row.depth.trim();
  if (row.height?.trim()) specs["Height"] = row.height.trim();
  if (row.seat_height?.trim()) specs["Seat Height"] = row.seat_height.trim();
  if (row.arm_height?.trim()) specs["Arm Height"] = row.arm_height.trim();
  return specs;
}

function buildDimensions(row: CsvRow): string | null {
  const parts: string[] = [];
  if (row.width?.trim()) parts.push(`W: ${row.width.trim()}`);
  if (row.depth?.trim()) parts.push(`D: ${row.depth.trim()}`);
  if (row.height?.trim()) parts.push(`H: ${row.height.trim()}`);
  if (row.seat_height?.trim()) parts.push(`Seat H: ${row.seat_height.trim()}`);
  if (row.arm_height?.trim()) parts.push(`Arm H: ${row.arm_height.trim()}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

// ---------------------------------------------------------------------------
// Image lookup: couture_jardin_images/{COLLECTION}/{SKU}.jpg
// Tries both the raw SKU and an ASCII-sanitized version.
// ---------------------------------------------------------------------------

function findLocalImage(collection: string, sku: string): string | null {
  const collDir = join(LOCAL_IMAGE_DIR, collection.toUpperCase());
  if (!existsSync(collDir)) {
    // Try title-case
    const titleDir = join(
      LOCAL_IMAGE_DIR,
      collection.charAt(0).toUpperCase() + collection.slice(1).toLowerCase(),
    );
    if (!existsSync(titleDir)) return null;
    return tryImageInDir(titleDir, sku);
  }
  return tryImageInDir(collDir, sku);
}

function tryImageInDir(dir: string, sku: string): string | null {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = join(dir, `${sku}${ext}`);
    if (existsSync(p)) return p;
    // Try ASCII-safe version for Cyrillic SKUs
    const safe = toAsciiSafe(sku);
    if (safe !== sku) {
      const p2 = join(dir, `${safe}${ext}`);
      if (existsSync(p2)) return p2;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }

  const rows = parsed.data.filter((r) => r.name?.trim() && r.sku?.trim());
  console.log(`CSV rows to process: ${rows.length}`);

  // ── Ensure manufacturer ──────────────────────────────────────────────────

  let [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.slug, MANUFACTURER_SLUG))
    .limit(1);

  if (!mfg) {
    const [ins] = await db
      .insert(manufacturersTable)
      .values({
        name: "Couture Jardin",
        slug: MANUFACTURER_SLUG,
        isActive: true,
      })
      .returning({ id: manufacturersTable.id });
    mfg = ins;
    console.log(`Created manufacturer "Couture Jardin" id=${mfg.id}`);
  } else {
    console.log(`Found manufacturer "Couture Jardin" id=${mfg.id}`);
  }

  // ── Ensure new categories ────────────────────────────────────────────────

  const categoryCache = new Map<string, number>(); // DB name → id

  // Load existing categories into cache
  const existingCats = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name })
    .from(categoriesTable);
  for (const c of existingCats) {
    categoryCache.set(c.name, c.id);
  }

  // Create any missing new categories
  for (const cat of NEW_CATEGORIES) {
    if (!categoryCache.has(cat.name)) {
      const [ins] = await db
        .insert(categoriesTable)
        .values({
          name: cat.name,
          slug: cat.slug,
          displayOrder: cat.displayOrder,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning({ id: categoriesTable.id });
      if (ins) {
        categoryCache.set(cat.name, ins.id);
        console.log(`Created category "${cat.name}" id=${ins.id}`);
      } else {
        // Conflict — fetch the existing row
        const [existing] = await db
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(eq(categoriesTable.slug, cat.slug))
          .limit(1);
        if (existing) {
          categoryCache.set(cat.name, existing.id);
          console.log(`Category "${cat.name}" already exists, id=${existing.id}`);
        }
      }
    }
  }

  // ── Process each product row ─────────────────────────────────────────────

  const usedSlugs = new Set<string>();

  // Pre-load all existing slugs so we can deduplicate safely
  const existingSlugs = await db
    .select({ slug: productsTable.slug })
    .from(productsTable);
  for (const { slug } of existingSlugs) usedSlugs.add(slug);

  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  for (const row of rows) {
    const name = row.name.trim();
    const sku = row.sku.trim();
    const collection = row.collection.trim();
    const csvCategory = row.category.trim();

    // Resolve category id
    const dbCategoryName = CATEGORY_MAP[csvCategory] ?? null;
    const categoryId = dbCategoryName
      ? (categoryCache.get(dbCategoryName) ?? null)
      : null;

    // Build description
    const rawDesc = row.description?.trim() ?? "";
    const lines = rawDesc.split(/\s*\|\s*/).filter(Boolean);
    const description = lines.join("\n• ").replace(/^/, "• ") || null;
    const shortDescription = description
      ? description.slice(0, 250).replace(/\s+\S*$/, "") + "…"
      : null;

    // Specs + dimensions
    const specs = buildSpecs(row);
    const dimensions = buildDimensions(row);

    // Tags from CSV (may be empty)
    const csvTags = row.tags?.trim()
      ? row.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    // Check existing product by SKU (idempotent)
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    // Check if we already have an image for this product
    const existingImage = existing
      ? await db
          .select({ id: productImagesTable.id })
          .from(productImagesTable)
          .where(eq(productImagesTable.productId, existing.id))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    // Upload image unless one already exists in storage
    let uploadedImageUrl: string | null = null;

    if (!existingImage) {
      const localPath = findLocalImage(collection, sku);
      if (localPath) {
        try {
          const buffer = await readFile(localPath);
          const lower = localPath.toLowerCase();
          const ext = lower.endsWith(".png")
            ? "png"
            : lower.endsWith(".webp")
              ? "webp"
              : "jpg";
          const contentType =
            ext === "png"
              ? "image/png"
              : ext === "webp"
                ? "image/webp"
                : "image/jpeg";
          // Use ASCII-safe SKU as the storage filename
          const safeFilename = `${toAsciiSafe(sku)}.${ext}`;
          uploadedImageUrl = await uploadBuffer(buffer, contentType, safeFilename);
          imagesUploaded++;
          console.log(`  ✓ image: ${safeFilename}`);
        } catch (err) {
          console.error(`  ✗ image upload error for ${sku}:`, err);
        }
      } else {
        console.warn(`  ⚠ no local image: collection=${collection} sku=${sku}`);
        imagesMissing++;
      }
    }

    if (existing) {
      // Update non-destructive fields
      await db
        .update(productsTable)
        .set({
          name,
          categoryId,
          description,
          shortDescription,
          dimensions,
          specs: Object.keys(specs).length > 0 ? specs : undefined,
          tags: csvTags.length > 0 ? csvTags : undefined,
        })
        .where(eq(productsTable.sku, sku));
      updated++;

      // Add image if not already present
      if (uploadedImageUrl && !existingImage) {
        await db
          .insert(productImagesTable)
          .values({
            productId: existing.id,
            variantId: null,
            url: uploadedImageUrl,
            altText: name,
            displayOrder: 0,
            isPrimary: true,
            imageKind: "gallery",
          })
          .onConflictDoNothing();
      }
    } else {
      // Build a unique slug
      const baseSlug = ensureUniqueSlug(toSlug(name) + "-cj", usedSlugs);

      const [ins] = await db
        .insert(productsTable)
        .values({
          name,
          slug: baseSlug,
          sku,
          description,
          shortDescription,
          manufacturerId: mfg.id,
          categoryId,
          dimensions,
          specs: Object.keys(specs).length > 0 ? specs : undefined,
          tags: csvTags.length > 0 ? csvTags : [],
          availableOnline: true,
          showPriceOnline: false,
          quoteOnly: true,
          inStoreOnly: false,
          isActive: true,
          featured: false,
          displayOrder: 0,
          lowStockThreshold: 0,
          pricingMode: "fixed",
        })
        .returning({ id: productsTable.id });

      const productId = ins.id;

      // Inventory row (no variants)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Primary image record
      if (uploadedImageUrl) {
        await db
          .insert(productImagesTable)
          .values({
            productId,
            variantId: null,
            url: uploadedImageUrl,
            altText: name,
            displayOrder: 0,
            isPrimary: true,
            imageKind: "gallery",
          })
          .onConflictDoNothing();
      }

      inserted++;
    }
  }

  console.log(
    `\nDone.\n` +
      `  Products inserted : ${inserted}\n` +
      `  Products updated  : ${updated}\n` +
      `  Images uploaded   : ${imagesUploaded}\n` +
      `  Images missing    : ${imagesMissing}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
