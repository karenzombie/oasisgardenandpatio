import { readFileSync, existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable } from "@workspace/db";
import {
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";
import { productVariantsTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/frankford_products_1780093294971.csv",
);
const MANUFACTURER_NAME = "Frankford Umbrellas";
const CATEGORY_ID = 38; // Umbrellas
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford";
const LOCAL_PRODUCT_IMAGE_DIR = join(
  WORKSPACE_ROOT,
  "frankford_images/frankford_products",
);

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
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// ---------------------------------------------------------------------------
// Local product image lookup
// Filename pattern: "greenwich-aluminum-market.png" etc.
// We match by slugifying the product name.
// ---------------------------------------------------------------------------

let productImageIndex: Map<string, string> | null = null;

async function getProductImageIndex(): Promise<Map<string, string>> {
  if (productImageIndex) return productImageIndex;
  const m = new Map<string, string>();
  if (!existsSync(LOCAL_PRODUCT_IMAGE_DIR)) {
    console.warn(`WARN: product image dir not found: ${LOCAL_PRODUCT_IMAGE_DIR}`);
    productImageIndex = m;
    return m;
  }
  const files = await readdir(LOCAL_PRODUCT_IMAGE_DIR);
  for (const f of files) {
    // Key: filename without extension, lower-cased
    const key = f.replace(/\.[^.]+$/, "").toLowerCase();
    m.set(key, f);
  }
  productImageIndex = m;
  return m;
}

function collectionToImageKey(collection: string): string {
  // Maps product collection names to local image filenames (no extension).
  // Strategy: strip the parenthesised lift/tilt qualifier, strip "Market",
  // then slugify. Examples:
  //   "Greenwich Aluminum Market"                → "greenwich-aluminum-market"
  //   "Monterey Fiberglass Market (Pulley Lift)" → "monterey-fiberglass-pulley-lift"
  //   "Monterey Fiberglass Market (Crank Lift / No Tilt)" → "monterey-fiberglass-crank-no-tilt"
  return collection
    .toLowerCase()
    // Pull the parenthesised part out before general slugification
    .replace(/\s*\(crank lift\s*\/\s*auto tilt\)/i, " crank-auto-tilt")
    .replace(/\s*\(crank lift\s*\/\s*no tilt\)/i, " crank-no-tilt")
    .replace(/\s*\(pulley lift\)/i, " pulley-lift")
    .replace(/\s*\(crank lift\)/i, " crank-lift")
    // Remove any remaining parenthesised qualifier
    .replace(/\s*\([^)]*\)/g, "")
    // Strip " market" when a lift/tilt qualifier follows it, so the image key
    // matches filenames like "monterey-fiberglass-pulley-lift.jpg".
    // "greenwich-aluminum-market" (no qualifier) retains "market".
    .replace(/\bmarket\s+(crank|pulley)/i, "$1")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function findProductImage(collection: string): Promise<string | null> {
  const idx = await getProductImageIndex();
  const key = collectionToImageKey(collection);
  return idx.get(key) ?? null;
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
  "Product Name": string;
  Collection: string;
  URL: string;
  SKU: string;
  "Shape / Size": string;
  "Open Clearance": string;
  "Closed Clearance": string;
  "Overall Height": string;
  "Mast Diameter": string;
  "Bottom Pole Length": string;
  "Crank Clearance": string;
  "Hub Clearance": string;
  "Open Depth": string;
  "Mast Height": string;
  "Upper Pole Length": string;
  "Lower Pole Length": string;
  Weight: string;
  "Frame Finishes": string;
  Features: string;
  Description: string;
};

// ---------------------------------------------------------------------------
// Build variant name from Shape/Size and any Crank/Tilt differentiator
// We also include the (Crank / No Tilt) style from the collection name
// when the same product name has multiple lift/tilt types.
// ---------------------------------------------------------------------------

function variantLabel(row: CsvRow): string {
  const size = row["Shape / Size"]?.trim() ?? "";
  return size || row.SKU.trim();
}

// Build dimensions string from measurements
function buildDimensions(row: CsvRow): string | null {
  const parts: string[] = [];
  if (row["Open Clearance"]?.trim())
    parts.push(`Open Clearance: ${row["Open Clearance"].trim()}`);
  if (row["Closed Clearance"]?.trim())
    parts.push(`Closed Clearance: ${row["Closed Clearance"].trim()}`);
  if (row["Overall Height"]?.trim())
    parts.push(`Overall Height: ${row["Overall Height"].trim()}`);
  if (row["Mast Diameter"]?.trim())
    parts.push(`Mast Diameter: ${row["Mast Diameter"].trim()}`);
  if (row["Mast Height"]?.trim())
    parts.push(`Mast Height: ${row["Mast Height"].trim()}`);
  if (row.Weight?.trim()) parts.push(`Weight: ${row.Weight.trim()}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }

  // Group rows by "Product Name" (the collection) — each group = one product
  const groups = new Map<string, CsvRow[]>();
  for (const row of parsed.data) {
    const name = row["Product Name"]?.trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(row);
  }
  console.log(`Collections (products to create): ${groups.size}`);

  // Ensure manufacturer exists
  let [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);

  if (!mfg) {
    const [ins] = await db
      .insert(manufacturersTable)
      .values({ name: MANUFACTURER_NAME, slug: "frankford-umbrellas", isActive: true })
      .returning({ id: manufacturersTable.id });
    mfg = ins;
    console.log(`Created manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  } else {
    console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  }

  const usedSlugs = new Set<string>();
  let productsInserted = 0;
  let productsUpdated = 0;
  let variantsInserted = 0;
  let variantsUpdated = 0;
  let imagesUploaded = 0;

  for (const [productName, rows] of groups) {
    const firstRow = rows[0];
    const collection = firstRow.Collection?.trim() ?? "";

    // Build product-level content
    const description = firstRow.Description?.trim() ?? null;
    const shortDescription =
      description ? description.slice(0, 300).replace(/\s+\S*$/, "") + "…" : null;

    // Dimensions from first SKU (varies per variant but product-level is an overview)
    const dimensions = buildDimensions(firstRow);
    const weightRaw = firstRow.Weight?.trim() ?? "";
    const weightNum = parseFloat(weightRaw.split("/")[0].replace(/[^0-9.]/g, ""));
    const weight = !isNaN(weightNum) ? String(weightNum) : null;

    // Frame finishes → description attributes (stored in description for now)
    const frameFinishes = firstRow["Frame Finishes"]?.trim() ?? null;
    const features = firstRow.Features?.trim() ?? null;

    // Full product description combining all fields
    const fullDescription = [
      description,
      features ? `\n\nFeatures: ${features.replace(/\s*\|\s*/g, " • ")}` : null,
      frameFinishes
        ? `\n\nFrame Finishes: ${frameFinishes.replace(/\s*\|\s*/g, ", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("") || null;

    // Check if product already exists by manufacturer + SKU prefix (use collection slug)
    const slug = ensureUniqueSlug(
      toSlug(productName) + "-frankford",
      usedSlugs,
    );

    // Use first SKU as the product-level SKU
    const productSku = firstRow.SKU.trim();

    const [existingProduct] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, productSku))
      .limit(1);

    // Upload product image (do this once per new product)
    let primaryImageUrl: string | null = null;
    if (!existingProduct) {
      const imageFilename = await findProductImage(productName);
      if (imageFilename) {
        try {
          const buffer = await readFile(
            join(LOCAL_PRODUCT_IMAGE_DIR, imageFilename),
          );
          const ext = imageFilename.toLowerCase().endsWith(".png") ? "png" : "jpg";
          const contentType = ext === "png" ? "image/png" : "image/jpeg";
          const storageFilename = `${toSlug(productName)}.${ext}`;
          primaryImageUrl = await uploadBuffer(buffer, contentType, storageFilename);
          imagesUploaded++;
          console.log(`  Uploaded image: ${storageFilename}`);
        } catch (err) {
          console.error(`  ERROR uploading image for ${productName}:`, err);
        }
      } else {
        console.warn(`  WARN: no local image for "${productName}" (key: ${collectionToImageKey(productName)})`);
      }
    }

    let productId: number;

    if (existingProduct) {
      await db
        .update(productsTable)
        .set({
          name: productName,
          description: fullDescription,
          shortDescription,
          dimensions,
          ...(weight ? { weight } : {}),
        })
        .where(eq(productsTable.id, existingProduct.id));
      productId = existingProduct.id;
      productsUpdated++;
      console.log(`  Updated product: ${productName} (id=${productId})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku: productSku,
          description: fullDescription,
          shortDescription,
          manufacturerId: mfg.id,
          categoryId: CATEGORY_ID,
          dimensions,
          ...(weight ? { weight } : {}),
          availableOnline: true,
          showPriceOnline: true,
          quoteOnly: false,
          inStoreOnly: false,
          isActive: true,
          featured: false,
          displayOrder: 0,
          lowStockThreshold: 0,
          pricingMode: "fixed",
        })
        .returning({ id: productsTable.id });
      productId = ins.id;
      productsInserted++;
      console.log(`  Inserted product: ${productName} (id=${productId})`);

      // Create inventory row (no variant — product-level)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });
    }

    // Register the uploaded image in product_images (only for new products)
    if (primaryImageUrl && !existingProduct) {
      await db.insert(productImagesTable).values({
        productId,
        variantId: null,
        url: primaryImageUrl,
        altText: productName,
        displayOrder: 0,
        isPrimary: true,
      });
    }

    // Upsert variants (one per SKU/size)
    for (let vi = 0; vi < rows.length; vi++) {
      const vrow = rows[vi];
      const variantSku = vrow.SKU.trim();
      const variantName = variantLabel(vrow);
      const variantDimensions = buildDimensions(vrow);
      const variantWeightRaw = vrow.Weight?.trim() ?? "";
      const variantWeightNum = parseFloat(
        variantWeightRaw.split("/")[0].replace(/[^0-9.]/g, ""),
      );

      const [existingVariant] = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.variantSku, variantSku))
        .limit(1);

      if (existingVariant) {
        await db
          .update(productVariantsTable)
          .set({
            variantName,
            displayOrder: vi,
            optionLabel: "Size",
          })
          .where(eq(productVariantsTable.id, existingVariant.id));
        variantsUpdated++;
      } else {
        const [insVariant] = await db
          .insert(productVariantsTable)
          .values({
            productId,
            variantSku,
            variantName,
            optionLabel: "Size",
            priceAdjustment: "0",
            displayOrder: vi,
            isActive: true,
          })
          .returning({ id: productVariantsTable.id });

        // Create inventory row for this variant
        await db.insert(inventoryTable).values({
          productId,
          variantId: insVariant.id,
          onHand: 0,
          reorderThreshold: 0,
        });
        variantsInserted++;
      }
    }
  }

  console.log(
    `\nDone. products: inserted=${productsInserted} updated=${productsUpdated} | ` +
      `variants: inserted=${variantsInserted} updated=${variantsUpdated} | ` +
      `images uploaded=${imagesUploaded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
