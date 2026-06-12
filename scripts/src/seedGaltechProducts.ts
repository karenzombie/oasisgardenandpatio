import { readFileSync } from "node:fs";
import { readFile, readdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  productsTable,
  productImagesTable,
  inventoryTable,
  finishesTable,
} from "@workspace/db";
import { productFinishOptionsTable } from "@workspace/db";
import { firstParagraph } from "./firstParagraph";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const PRODUCTS_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_products_1781232430110.csv",
);
const FINISHES_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_product_finishes_1780285433973.csv",
);
const MANUFACTURER_NAME = "Galtech International";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/galtech";
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "galtech_images");

// Category IDs
const CATEGORY_UMBRELLAS = 38;
const CATEGORY_BASES = 39;

const CATEGORY_MAP: Record<string, number> = {
  Aluminum: CATEGORY_UMBRELLAS,
  Commercial: CATEGORY_UMBRELLAS,
  Wood: CATEGORY_UMBRELLAS,
  Cantilever: CATEGORY_UMBRELLAS,
  Teak: CATEGORY_UMBRELLAS,
  Bases: CATEGORY_BASES,
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

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Upload all images for a model. Returns { primary, extras }
// Priority: studio.jpg → location.jpg → spec.jpg (primary = first found)
// ---------------------------------------------------------------------------

async function uploadModelImages(
  modelNumber: string,
  productSlug: string,
): Promise<{ primary: string | null; extras: string[] }> {
  const modelDir = join(LOCAL_IMAGE_BASE, modelNumber);
  const candidates = ["studio.jpg", "location.jpg", "spec.jpg"];

  let primary: string | null = null;
  const extras: string[] = [];

  for (const imgFile of candidates) {
    const fullPath = join(modelDir, imgFile);
    if (!(await fileExists(fullPath))) continue;
    try {
      const buffer = await readFile(fullPath);
      const suffix = imgFile.replace(".jpg", "");
      const storageName = `${productSlug}-${suffix}.jpg`;
      const url = await uploadBuffer(buffer, "image/jpeg", storageName);
      if (primary === null) {
        primary = url;
      } else {
        extras.push(url);
      }
    } catch (err) {
      console.error(`    WARN: failed to upload ${imgFile} for ${modelNumber}:`, err);
    }
  }

  return { primary, extras };
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['/,]/g, "")
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
// CSV row shapes
// ---------------------------------------------------------------------------

type ProductRow = {
  category: string;
  model_number: string;
  product_name: string;
  product_url: string;
  specs: string;
  finishes_list: string;
  finish_count: string;
};

type FinishRow = {
  category: string;
  model_number: string;
  product_name: string;
  finish_name: string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse CSVs
  const productRaw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsedProducts = Papa.parse<ProductRow>(productRaw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsedProducts.errors.length > 0) {
    console.error("Products CSV parse errors:", parsedProducts.errors.slice(0, 5));
    throw new Error("Products CSV parse failed");
  }

  const finishRaw = readFileSync(FINISHES_CSV, "utf8");
  const parsedFinishes = Papa.parse<FinishRow>(finishRaw, {
    header: true,
    skipEmptyLines: true,
  });

  // Build model_number → finish names map
  const modelFinishes = new Map<string, string[]>();
  for (const row of parsedFinishes.data) {
    const model = row.model_number?.trim();
    const finish = row.finish_name?.trim();
    if (!model || !finish) continue;
    if (!modelFinishes.has(model)) modelFinishes.set(model, []);
    modelFinishes.get(model)!.push(finish);
  }

  // Ensure manufacturer exists
  let [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);

  if (!mfg) {
    const [ins] = await db
      .insert(manufacturersTable)
      .values({
        name: MANUFACTURER_NAME,
        slug: "galtech-international",
        isActive: true,
      })
      .returning({ id: manufacturersTable.id });
    mfg = ins;
    console.log(`Created manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  } else {
    console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  }

  // Load all Galtech finishes from DB (name → id)
  const dbFinishes = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, mfg.id));
  const finishNameToId = new Map<string, number>(
    dbFinishes.map((f) => [f.name.toLowerCase(), f.id]),
  );
  console.log(`Loaded ${finishNameToId.size} Galtech finishes from DB`);

  const usedSlugs = new Set<string>();
  let productsInserted = 0;
  let productsUpdated = 0;
  let imagesUploaded = 0;
  let finishLinksCreated = 0;

  for (const row of parsedProducts.data) {
    const modelNumber = row.model_number?.trim();
    const productName = row.product_name?.trim();
    const category = row.category?.trim();
    const specs = row.specs?.trim() ?? null;

    if (!modelNumber || !productName) continue;

    const categoryId = CATEGORY_MAP[category] ?? CATEGORY_UMBRELLAS;
    const sku = `GT-${modelNumber}`;
    const slugBase = toSlug(productName) + "-galtech";
    const slug = ensureUniqueSlug(slugBase, usedSlugs);

    // Build description from specs (pipe-delimited → bullet prose)
    const description = specs
      ? specs.replace(/\s*\|\s*/g, " • ")
      : null;

    const [existingProduct] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    // Upload images for new products
    let primaryImageUrl: string | null = null;
    let extraImageUrls: string[] = [];

    if (!existingProduct) {
      const result = await uploadModelImages(modelNumber, toSlug(productName) + "-galtech");
      primaryImageUrl = result.primary;
      extraImageUrls = result.extras;
      if (primaryImageUrl) {
        imagesUploaded += 1 + extraImageUrls.length;
        console.log(
          `  Uploaded ${1 + extraImageUrls.length} image(s) for ${productName}`,
        );
      } else {
        console.warn(`  WARN: no images found for model ${modelNumber} (${productName})`);
      }
    }

    let productId: number;

    if (existingProduct) {
      await db
        .update(productsTable)
        .set({ name: productName, description })
        .where(eq(productsTable.id, existingProduct.id));
      productId = existingProduct.id;
      productsUpdated++;
      console.log(`  Updated: ${productName} (id=${productId})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku,
          description,
          shortDescription: description ? firstParagraph(description) : null,
          manufacturerId: mfg.id,
          categoryId,
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
      console.log(`  Inserted: ${productName} (id=${productId}, sku=${sku})`);

      // Inventory row (no variants)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Register images
      if (primaryImageUrl) {
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url: primaryImageUrl,
          altText: productName,
          displayOrder: 0,
          isPrimary: true,
        });
        for (let i = 0; i < extraImageUrls.length; i++) {
          await db.insert(productImagesTable).values({
            productId,
            variantId: null,
            url: extraImageUrls[i],
            altText: productName,
            displayOrder: i + 1,
            isPrimary: false,
          });
        }
      }
    }

    // Link finishes (idempotent)
    const finishNames = modelFinishes.get(modelNumber) ?? [];
    for (let fi = 0; fi < finishNames.length; fi++) {
      const finishName = finishNames[fi];
      const finishId = finishNameToId.get(finishName.toLowerCase());
      if (!finishId) {
        console.warn(`    WARN: finish "${finishName}" not found in DB for model ${modelNumber}`);
        continue;
      }
      const [existing] = await db
        .select({ id: productFinishOptionsTable.id })
        .from(productFinishOptionsTable)
        .where(
          and(
            eq(productFinishOptionsTable.productId, productId),
            eq(productFinishOptionsTable.finishId, finishId),
          ),
        )
        .limit(1);
      if (!existing) {
        await db.insert(productFinishOptionsTable).values({
          productId,
          finishId,
          displayOrder: fi,
        });
        finishLinksCreated++;
      }
    }
  }

  console.log(
    `\nDone. products: inserted=${productsInserted} updated=${productsUpdated} | ` +
      `images uploaded=${imagesUploaded} | finish links created=${finishLinksCreated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
