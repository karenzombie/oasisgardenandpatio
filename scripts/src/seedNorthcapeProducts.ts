/**
 * Seed NorthCape products from CSV + local images.
 *
 * Image structure: northcape_images/{folder}/
 *   - Primary:    {folder}_main.{ext}
 *   - Additional: {folder}_2.{ext}, _3, _4 … (numeric from 2 upward)
 *
 * Folder name = SKU exactly.
 * Blank-SKU rows derive folder from Product URL slug → "NOSKU_{slug}".
 *
 * Color options → finishes table + product_finish_options links.
 *
 * All products: quoteOnly=true, showPriceOnline=false.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-northcape-products
 */

import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  productsTable,
  productImagesTable,
  inventoryTable,
  finishesTable,
  productFinishOptionsTable,
} from "@workspace/db";
import { firstParagraph } from "./firstParagraph";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/northcape_products_clean_1780183547311.csv",
);
const COLOR_CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/northcape_color_options_final_1780183550064.csv",
);
const LOCAL_IMAGE_DIR = join(WORKSPACE_ROOT, "northcape_images");
const MANUFACTURER_ID = 17; // NorthCape
const STORAGE_SUBDIR = "products/northcape";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ---------------------------------------------------------------------------
// Category mapping: CSV "Category" column value → DB category ID
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, number | null> = {
  "Deep Seating & Lounge": 43, // Deep Seating
  "Dining Tables": 44, // Dining
  "Chaise Lounges": 42, // Chaise Lounges
  "Fire Tables": 45, // Fire Tables
  Ottomans: 43, // Deep Seating (ottomans are part of seating sets)
  "Furniture Sets": null, // no direct match
  Storage: 49, // Accent Pieces
  Accessories: 49, // Accent Pieces
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
// Helpers
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
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function mimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Image folder resolution
//
// Priority:
//   1. Exact SKU → folder name
//   2. Blank SKU → NOSKU_{slug} derived from Product URL path segment
// ---------------------------------------------------------------------------

function noskyFromUrl(url: string): string | null {
  // https://www.northcape.com/product/{slug}/
  const m = url.match(/\/product\/([^/]+)\//);
  if (!m) return null;
  return `NOSKU_${m[1]}`;
}

function resolveFolder(
  csvSku: string,
  productUrl: string,
): { folder: string; dbSku: string } | null {
  // Blank-SKU rows: derive from URL
  if (!csvSku) {
    const folder = noskyFromUrl(productUrl);
    if (!folder || !existsSync(join(LOCAL_IMAGE_DIR, folder))) return null;
    return { folder, dbSku: folder };
  }
  // Exact folder match
  if (existsSync(join(LOCAL_IMAGE_DIR, csvSku))) {
    return { folder: csvSku, dbSku: csvSku };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image discovery
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

  const mainFile =
    imageFiles.find((f) => f.toLowerCase().includes("_main.")) ?? null;

  const numberedPattern = new RegExp(
    `^${escapeRegex(folderName)}_(\\d+)\\.`,
    "i",
  );
  const numbered = imageFiles
    .filter((f) => numberedPattern.test(f))
    .sort(
      (a, b) =>
        parseInt(numberedPattern.exec(a)![1]) -
        parseInt(numberedPattern.exec(b)![1]),
    );

  return {
    primary: mainFile ? join(dir, mainFile) : null,
    additional: numbered.map((f) => join(dir, f)),
  };
}

// ---------------------------------------------------------------------------
// CSV row types
// ---------------------------------------------------------------------------

type ProductRow = {
  "Product Name": string;
  SKU: string;
  Collection: string;
  "Material Type": string;
  Category: string;
  Dimensions: string;
  "Seat Size": string;
  "Deck Height": string;
  "Cushion Info": string;
  Description: string;
  Features: string;
  Tags: string;
  Brand: string;
  "Product URL": string;
  "Image URL": string;
  "Additional Images": string;
};

type ColorRow = {
  "Option Type": string;
  "Option Value": string;
  Collection: string;
  "Material Type": string;
  "Product Name": string;
  SKU: string;
  "Image Folder": string;
  "Available Images": string;
  "Image Note": string;
  "Product URL": string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse product CSV
  const raw = readFileSync(CSV_PATH, "utf8");
  const { data, errors } = Papa.parse<ProductRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0)
    throw new Error(`CSV parse error: ${JSON.stringify(errors[0])}`);

  const rows = data.filter((r) => r["Product Name"]?.trim());
  console.log(`CSV rows to process: ${rows.length}`);

  // Parse color options CSV
  const colorRaw = readFileSync(COLOR_CSV_PATH, "utf8");
  const { data: colorData } = Papa.parse<ColorRow>(colorRaw, {
    header: true,
    skipEmptyLines: true,
  });

  // Pre-load existing slugs to avoid collisions
  const usedSlugs = new Set<string>();
  const existingSlugs = await db
    .select({ slug: productsTable.slug })
    .from(productsTable);
  for (const { slug } of existingSlugs) usedSlugs.add(slug);

  // SKU → productId map used for finish linking at the end
  const skuToProductId = new Map<string, number>();

  let inserted = 0,
    updated = 0,
    imagesUploaded = 0,
    noFolder = 0;

  for (const row of rows) {
    const name = row["Product Name"].trim();
    const csvSku = row.SKU?.trim() ?? "";
    const collection = row.Collection?.trim() ?? "";
    const materialType = row["Material Type"]?.trim() ?? "";
    const csvCategory = row.Category?.trim() ?? "";
    const productUrl = row["Product URL"]?.trim() ?? "";

    // Build description: Description body + Features (pipe-delimited → newlines)
    const descBody = row.Description?.trim() ?? "";
    const features = row.Features?.trim() ?? "";
    const descParts: string[] = [];
    if (descBody) descParts.push(descBody);
    if (features)
      descParts.push(features.split(" | ").join("\n"));
    const description = descParts.length > 0 ? descParts.join("\n\n") : null;

    const shortDescription = descBody ? firstParagraph(descBody) : null;

    // Tags: collection, material type, category
    const tags: string[] = [];
    if (collection) tags.push(collection);
    if (materialType && materialType !== collection) tags.push(materialType);
    if (csvCategory && csvCategory !== collection) tags.push(csvCategory);

    const categoryId = CATEGORY_MAP[csvCategory] ?? null;

    // Resolve folder + DB SKU
    const resolved = resolveFolder(csvSku, productUrl);
    const dbSku =
      resolved?.dbSku ??
      (csvSku || (noskyFromUrl(productUrl) ?? toSlug(name)));
    const folderName = resolved?.folder ?? null;

    // Check existing product
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
        console.log(
          `  ✓ ${dbSku} → ${folderName}/ (1 primary + ${additional.length} additional)`,
        );
        for (let idx = 0; idx < allPaths.length; idx++) {
          const localPath = allPaths[idx];
          const filename = localPath.split("/").pop()!;
          const storageKey = `${STORAGE_SUBDIR}/${folderName}/${filename}`;
          try {
            const buffer = await readFile(localPath);
            const storageUrl = await uploadBuffer(
              buffer,
              mimeType(localPath),
              storageKey,
            );
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

    let productId: number;

    if (existingProduct) {
      await db
        .update(productsTable)
        .set({
          name,
          description,
          shortDescription,
          ...(categoryId !== null ? { categoryId } : {}),
          ...(tags.length > 0 ? { tags } : {}),
        })
        .where(eq(productsTable.sku, dbSku));
      productId = existingProduct.id;
      updated++;

      if (uploadedImages.length > 0 && existingImageCount === 0) {
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
      }
    } else {
      const baseSlug = ensureUniqueSlug(toSlug(name) + "-nc", usedSlugs);

      const [ins] = await db
        .insert(productsTable)
        .values({
          name,
          slug: baseSlug,
          sku: dbSku,
          description,
          shortDescription,
          manufacturerId: MANUFACTURER_ID,
          categoryId,
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

      productId = ins.id;

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

    skuToProductId.set(dbSku, productId);
  }

  // -------------------------------------------------------------------------
  // Finishes from color options CSV
  // -------------------------------------------------------------------------

  console.log("\nProcessing color options / finishes...");

  let finishesInserted = 0,
    finishLinksInserted = 0;

  for (const row of colorData) {
    const optionType = row["Option Type"]?.trim();
    const optionValue = row["Option Value"]?.trim();
    const targetSku = row.SKU?.trim();
    if (!optionType || !optionValue || !targetSku) continue;

    // Upsert finish (unique on manufacturerId + name + description)
    const [existingFinish] = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, MANUFACTURER_ID),
          eq(finishesTable.name, optionValue),
          eq(finishesTable.description, optionType),
        ),
      )
      .limit(1);

    let finishId: number;
    if (existingFinish) {
      finishId = existingFinish.id;
    } else {
      const [ins] = await db
        .insert(finishesTable)
        .values({
          manufacturerId: MANUFACTURER_ID,
          name: optionValue,
          description: optionType,
          isActive: true,
          displayOrder: 0,
        })
        .returning({ id: finishesTable.id });
      finishId = ins.id;
      finishesInserted++;
      console.log(`  + finish: "${optionType}" / "${optionValue}"`);
    }

    // Resolve product ID (may already be in map or need DB lookup)
    let productId = skuToProductId.get(targetSku);
    if (!productId) {
      const [prod] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.sku, targetSku))
        .limit(1);
      if (!prod) {
        console.warn(`  ⚠ product not found for finish link: ${targetSku}`);
        continue;
      }
      productId = prod.id;
    }

    // Link finish → product (idempotent)
    const [linkExisting] = await db
      .select({ id: productFinishOptionsTable.id })
      .from(productFinishOptionsTable)
      .where(
        and(
          eq(productFinishOptionsTable.productId, productId),
          eq(productFinishOptionsTable.finishId, finishId),
        ),
      )
      .limit(1);

    if (!linkExisting) {
      await db
        .insert(productFinishOptionsTable)
        .values({ productId, finishId, displayOrder: 0 })
        .onConflictDoNothing();
      finishLinksInserted++;
      console.log(
        `  → linked "${optionValue}" to product ${targetSku} (id ${productId})`,
      );
    }
  }

  console.log(
    `\nDone.\n` +
      `  Products inserted  : ${inserted}\n` +
      `  Products updated   : ${updated}\n` +
      `  Images uploaded    : ${imagesUploaded}\n` +
      `  Products w/o folder: ${noFolder}\n` +
      `  Finishes created   : ${finishesInserted}\n` +
      `  Finish links added : ${finishLinksInserted}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
