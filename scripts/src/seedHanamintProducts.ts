/**
 * Seed Hanamint products from CSV + local images.
 *
 * Image structure: hanamint_images/{folder}/
 *   - Primary:    {folder}_main.{ext}
 *   - Additional: {folder}_2.{ext}, _3, _4 … (numeric from 2 upward)
 *
 * Folder name = SKU exactly, or sanitized (spaces/parens → _).
 * Three blank-SKU rows get synthetic SKUs from their NOSKU_ folder names.
 *
 * All products: quoteOnly=true, showPriceOnline=false.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-hanamint-products
 */

import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";
import { firstParagraph } from "./firstParagraph";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/hanamint_products_clean_1780113404627.csv",
);
const LOCAL_IMAGE_DIR = join(WORKSPACE_ROOT, "hanamint_images");
const MANUFACTURER_ID = 15; // Hanamint
const STORAGE_SUBDIR = "products/hanamint";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ---------------------------------------------------------------------------
// Blank-SKU → NOSKU folder + synthetic SKU map (by product name)
// ---------------------------------------------------------------------------

const NOSKU_BY_NAME: Record<string, string> = {
  "Door Knob for Fire Pit Tables":
    "NOSKU_door-knob-for-fire-pit-tables",
  "Alumont Coved Stem Glide - For older Alumont Swivel Rockers - Pack of 16":
    "NOSKU_alumont-coved-stem-glide-for-older-alumont-swivel-rockers-pack-of-20",
  "Replacement Wheel for Chaise or Tea Cart":
    "NOSKU_wheel-tire",
};

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
  storageKey: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${storageKey}`;
}

// ---------------------------------------------------------------------------
// Slug / helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
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

function mimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// Image folder resolution
//
// Priority:
//   1. Exact SKU → folder name
//   2. Sanitized SKU (spaces/parens → _)
//   3. Blank SKU → look up NOSKU folder by product name
// ---------------------------------------------------------------------------

function sanitizeToFolder(sku: string): string {
  // *Note → _Note (asterisk becomes leading underscore, keep it)
  if (sku.startsWith("*")) {
    return "_" + sku.slice(1);
  }
  return sku
    .replace(/\(/g, "_")
    .replace(/\)/g, "_")
    .replace(/ /g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function resolveFolder(
  csvSku: string,
  productName: string,
): { folder: string; dbSku: string } | null {
  // Blank SKU rows
  if (!csvSku) {
    const folder = NOSKU_BY_NAME[productName];
    if (!folder) return null;
    return { folder, dbSku: folder };
  }

  // Exact match
  if (existsSync(join(LOCAL_IMAGE_DIR, csvSku))) {
    return { folder: csvSku, dbSku: csvSku };
  }

  // Sanitized match
  const sanitized = sanitizeToFolder(csvSku);
  if (existsSync(join(LOCAL_IMAGE_DIR, sanitized))) {
    return { folder: sanitized, dbSku: csvSku }; // keep original as DB SKU
  }

  return null; // no folder found — product will be inserted without images
}

// ---------------------------------------------------------------------------
// Discover images within a folder
//
// Primary:    {folder}_main.{ext}
// Additional: {folder}_2.{ext}, {folder}_3.{ext}, … (sorted numerically)
// ---------------------------------------------------------------------------

interface DiscoveredImages {
  primary: string | null;
  additional: string[];
}

async function discoverImages(folderName: string): Promise<DiscoveredImages> {
  const dir = join(LOCAL_IMAGE_DIR, folderName);
  if (!existsSync(dir)) return { primary: null, additional: [] };

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return { primary: null, additional: [] };
  }

  const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const imageFiles = files.filter((f) =>
    IMAGE_EXTS.has(extname(f).toLowerCase()),
  );

  const mainFile = imageFiles.find((f) =>
    f.toLowerCase().includes("_main."),
  ) ?? null;

  // Numbered additional files: {folder}_2.ext, _3.ext, …
  const numberedPattern = new RegExp(`^${escapeRegex(folderName)}_(\\d+)\\.`, "i");
  const numbered = imageFiles
    .filter((f) => numberedPattern.test(f))
    .sort((a, b) => {
      const na = parseInt(numberedPattern.exec(a)![1]);
      const nb = parseInt(numberedPattern.exec(b)![1]);
      return na - nb;
    });

  return {
    primary: mainFile ? join(dir, mainFile) : null,
    additional: numbered.map((f) => join(dir, f)),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// CSV row type
// ---------------------------------------------------------------------------

type CsvRow = {
  "Product Name": string;
  SKU: string;
  Price: string;
  Availability: string;
  Category: string;
  Collection: string;
  Description: string;
  Brand: string;
  "Product URL": string;
  "Image URL": string;
  "Additional Images": string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const { data, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0)
    throw new Error(`CSV parse error: ${JSON.stringify(errors[0])}`);

  const rows = data.filter((r) => r["Product Name"]?.trim());
  console.log(`CSV rows to process: ${rows.length}`);

  // Pre-load existing slugs
  const usedSlugs = new Set<string>();
  const existing = await db
    .select({ slug: productsTable.slug })
    .from(productsTable);
  for (const { slug } of existing) usedSlugs.add(slug);

  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;
  let noFolder = 0;

  for (const row of rows) {
    // Strip any leading numeric code that bleeds into the product name
    // e.g. "694077 Swing Cushion" → "Swing Cushion"
    const name = row["Product Name"].trim().replace(/^\d+\s+/, "");
    const csvSku = row.SKU?.trim() ?? "";
    const collection = row.Collection?.trim() ?? "";
    const description = row.Description?.trim() || null;
    const category = row.Category?.trim() ?? "";

    // Build tags from collection and category
    const tags: string[] = [];
    if (collection) tags.push(collection);
    if (category && category !== collection) tags.push(category);

    // Resolve image folder + canonical DB SKU
    const resolved = resolveFolder(csvSku, name);
    const dbSku = resolved?.dbSku ?? (csvSku || toSlug(name));
    const folderName = resolved?.folder ?? null;

    // Check existing product (by SKU)
    const [existingProduct] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, dbSku))
      .limit(1);

    // Check existing images
    const existingImageCount = existingProduct
      ? (
          await db
            .select({ id: productImagesTable.id })
            .from(productImagesTable)
            .where(eq(productImagesTable.productId, existingProduct.id))
        ).length
      : 0;

    // Discover + upload images if needed
    interface UploadedImage {
      storageUrl: string;
      displayOrder: number;
      isPrimary: boolean;
    }
    const uploadedImages: UploadedImage[] = [];

    if (existingImageCount === 0 && folderName) {
      const { primary, additional } = await discoverImages(folderName);
      const allPaths = primary ? [primary, ...additional] : additional;

      if (allPaths.length === 0) {
        console.warn(`  ⚠ no images in folder: ${folderName}`);
        noFolder++;
      } else {
        const addlCount = additional.length;
        console.log(
          `  ✓ ${dbSku} → ${folderName}/ (1 primary + ${addlCount} additional)`,
        );
        for (let idx = 0; idx < allPaths.length; idx++) {
          const localPath = allPaths[idx];
          const filename = localPath.split("/").pop()!;
          const storageKey = `${STORAGE_SUBDIR}/${folderName}/${filename}`;
          try {
            const buffer = await readFile(localPath);
            const ct = mimeType(localPath);
            const storageUrl = await uploadBuffer(buffer, ct, storageKey);
            uploadedImages.push({
              storageUrl,
              displayOrder: idx,
              isPrimary: idx === 0,
            });
            imagesUploaded++;
          } catch (err) {
            console.error(`  ✗ upload error ${filename}:`, err);
          }
        }
      }
    } else if (existingImageCount === 0 && !folderName) {
      if (!existingProduct) {
        console.warn(`  ⚠ no image folder: ${dbSku} [${name}]`);
        noFolder++;
      }
    }

    if (existingProduct) {
      await db
        .update(productsTable)
        .set({
          name,
          description,
          ...(tags.length > 0 ? { tags } : {}),
        })
        .where(eq(productsTable.sku, dbSku));
      updated++;

      if (uploadedImages.length > 0 && existingImageCount === 0) {
        for (const img of uploadedImages) {
          await db
            .insert(productImagesTable)
            .values({
              productId: existingProduct.id,
              variantId: null,
              url: img.storageUrl,
              altText: name,
              displayOrder: img.displayOrder,
              isPrimary: img.isPrimary,
              imageKind: "gallery",
            })
            .onConflictDoNothing();
        }
      }
    } else {
      const baseSlug = ensureUniqueSlug(toSlug(name) + "-hm", usedSlugs);

      const [ins] = await db
        .insert(productsTable)
        .values({
          name,
          slug: baseSlug,
          sku: dbSku,
          description,
          shortDescription: description ? firstParagraph(description) : null,
          manufacturerId: MANUFACTURER_ID,
          categoryId: null,
          tags: tags.length > 0 ? tags : [],
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

      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      for (const img of uploadedImages) {
        await db
          .insert(productImagesTable)
          .values({
            productId,
            variantId: null,
            url: img.storageUrl,
            altText: name,
            displayOrder: img.displayOrder,
            isPrimary: img.isPrimary,
            imageKind: "gallery",
          })
          .onConflictDoNothing();
      }

      inserted++;
    }
  }

  console.log(
    `\nDone.\n` +
      `  Products inserted  : ${inserted}\n` +
      `  Products updated   : ${updated}\n` +
      `  Images uploaded    : ${imagesUploaded}\n` +
      `  Products w/o folder: ${noFolder}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
