/**
 * Create (or idempotently update) the 4 Galtech "grouped base" products that
 * live in the products CSV under category=Bases:
 *   GT-europeanbases, GT-heavy-weight-bases, GT-steel-plate-bases, GT-wheels-bases
 *
 * These products are NOT in the MSRP/sale pricing CSV that seedGaltech.ts reads,
 * so they were never created by that script. They must be seeded separately.
 *
 * Idempotent lookup order:
 *   1. By GT-{model} SKU (prod — already correct)
 *   2. By slug  (dev — exists under bare model SKU, deactivated by seedGaltech)
 *   3. Insert new (first-ever run)
 * In case 2 the SKU is corrected to GT-{model} and the product is reactivated.
 * Images are uploaded only when the product has no registered images yet.
 *
 * Run:  pnpm --filter @workspace/scripts exec tsx src/seedGaltechBases.ts
 * Prod: DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedGaltechBases.ts
 */
import { readFile, readdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { eq, and, count } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  productsTable,
  productImagesTable,
  inventoryTable,
  finishesTable,
  productFinishOptionsTable,
} from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "galtech_images");
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/galtech";
const MANUFACTURER_NAME = "Galtech International";
const CATEGORY_BASES = 39;

const BASES: {
  modelNumber: string;
  name: string;
  description: string;
  finishNames: string[];
}[] = [
  {
    modelNumber: "europeanbases",
    name: "European Bases",
    description:
      "Cast Iron • 40 lbs or 75 lbs • Anti rust primer • Long and short tubes provided • Protective rubber feet",
    finishNames: ["Antique Bronze", "Black"],
  },
  {
    modelNumber: "heavy-weight-bases",
    name: "Heavy Weight Bases",
    description:
      '120 or 170 lbs • Protective rubber feet • Stainless Steel Shell • Will hold up to 1.75" diameter pole • Must ship via LTL truck • 24" base tube available for commercial use',
    finishNames: ["Black", "Silver"],
  },
  {
    modelNumber: "steel-plate-bases",
    name: "Steel Plate Bases",
    description:
      '40, 60 or 85 lbs • 40 lb is designed for 772 half wall umbrella • Protective rubber feet • New Stainless Steel Shell (on all except wheel base) • 24" base tube available for commercial use',
    finishNames: ["Black", "Silver"],
  },
  {
    modelNumber: "wheels-bases",
    name: "Wheels Bases",
    description:
      '95 lbs • Anti rust primer • Two wheels for mobility • Stainless foot plate to assist in moving base • Protective rubber feet • 24" base tube available for commercial use',
    finishNames: ["Black", "Silver"],
  },
];

// ── Object Storage ───────────────────────────────────────────────────────────

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

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0]!;
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

async function uploadModelImages(
  modelNumber: string,
  slugBase: string,
): Promise<{ primary: string | null; extras: string[] }> {
  const dir = join(LOCAL_IMAGE_BASE, modelNumber);
  if (!(await pathExists(dir))) return { primary: null, extras: [] };

  const files = (await readdir(dir))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => {
      const priority = ["studio.jpg", "location.jpg", "spec.jpg"];
      const ai = priority.indexOf(a.toLowerCase());
      const bi = priority.indexOf(b.toLowerCase());
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  if (!files.length) return { primary: null, extras: [] };

  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const localPath = join(dir, f);
    const ext = f.split(".").pop()!.toLowerCase();
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const storageName = `${slugBase}-${i}.${ext}`;
    const buf = await readFile(localPath);
    const url = await uploadBuffer(buf, contentType, storageName);
    urls.push(url);
  }
  return { primary: urls[0] ?? null, extras: urls.slice(1) };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME));
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);

  const finRows = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, mfg.id));
  const finByName = new Map(finRows.map((f) => [f.name.toLowerCase(), f.id]));

  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;

  for (const base of BASES) {
    const sku = `GT-${base.modelNumber}`;
    const slugBase = slugify(base.name) + "-galtech";

    // ── Lookup: GT-SKU → slug → insert ──────────────────────────────────────
    let productId: number;
    let isNew = false;

    const bySkuRow = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (bySkuRow[0]) {
      // Already has the correct GT- SKU — just refresh fields.
      productId = bySkuRow[0].id;
      await db
        .update(productsTable)
        .set({
          name: base.name,
          description: base.description,
          isActive: true,
          availableOnline: true,
          showPriceOnline: true,
        })
        .where(eq(productsTable.id, productId));
      updated++;
      console.log(`  Updated (by SKU): ${base.name} (id=${productId}, sku=${sku})`);
    } else {
      // Fall back to slug — product may exist under the old bare-model SKU.
      const bySlugRow = await db
        .select({ id: productsTable.id, sku: productsTable.sku })
        .from(productsTable)
        .where(eq(productsTable.slug, slugBase))
        .limit(1);

      if (bySlugRow[0]) {
        productId = bySlugRow[0].id;
        await db
          .update(productsTable)
          .set({
            sku,
            name: base.name,
            description: base.description,
            isActive: true,
            availableOnline: true,
            showPriceOnline: true,
          })
          .where(eq(productsTable.id, productId));
        updated++;
        console.log(
          `  Updated (by slug, corrected SKU ${bySlugRow[0].sku} → ${sku}): ` +
            `${base.name} (id=${productId})`,
        );
      } else {
        // Truly new product.
        isNew = true;
        productId = -1; // set after insert
      }
    }

    // ── Upload images if this product has none yet ───────────────────────────
    if (!isNew) {
      const [imgCount] = await db
        .select({ n: count() })
        .from(productImagesTable)
        .where(eq(productImagesTable.productId, productId));
      if ((imgCount?.n ?? 0) === 0) {
        const { primary, extras } = await uploadModelImages(base.modelNumber, slugBase);
        if (primary) {
          imagesUploaded += 1 + extras.length;
          await db.insert(productImagesTable).values({
            productId,
            variantId: null,
            url: primary,
            altText: base.name,
            displayOrder: 0,
            isPrimary: true,
          });
          for (let i = 0; i < extras.length; i++) {
            await db.insert(productImagesTable).values({
              productId,
              variantId: null,
              url: extras[i]!,
              altText: base.name,
              displayOrder: i + 1,
              isPrimary: false,
            });
          }
          console.log(`  Uploaded ${1 + extras.length} image(s) for ${base.name}`);
        } else {
          console.warn(`  WARN: no images found for ${base.modelNumber}`);
        }
      } else {
        console.log(`  Images already present for ${base.name} (${imgCount?.n})`);
      }
    }

    if (isNew) {
      const { primary, extras } = await uploadModelImages(base.modelNumber, slugBase);
      if (primary) {
        imagesUploaded += 1 + extras.length;
        console.log(`  Uploaded ${1 + extras.length} image(s) for ${base.name}`);
      } else {
        console.warn(`  WARN: no images found for ${base.modelNumber}`);
      }

      const [ins] = await db
        .insert(productsTable)
        .values({
          name: base.name,
          slug: slugBase,
          sku,
          description: base.description,
          shortDescription: base.name,
          manufacturerId: mfg.id,
          categoryId: CATEGORY_BASES,
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
      productId = ins!.id;
      inserted++;
      console.log(`  Inserted: ${base.name} (id=${productId}, sku=${sku})`);

      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      if (primary) {
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url: primary,
          altText: base.name,
          displayOrder: 0,
          isPrimary: true,
        });
        for (let i = 0; i < extras.length; i++) {
          await db.insert(productImagesTable).values({
            productId,
            variantId: null,
            url: extras[i]!,
            altText: base.name,
            displayOrder: i + 1,
            isPrimary: false,
          });
        }
      }
    }

    // ── Sync finish options (idempotent) ─────────────────────────────────────
    for (let fi = 0; fi < base.finishNames.length; fi++) {
      const finName = base.finishNames[fi]!;
      const finishId = finByName.get(finName.toLowerCase());
      if (!finishId) {
        console.warn(`  WARN: finish "${finName}" not found for ${sku}`);
        continue;
      }
      const [existingLink] = await db
        .select({ id: productFinishOptionsTable.id })
        .from(productFinishOptionsTable)
        .where(
          and(
            eq(productFinishOptionsTable.productId, productId),
            eq(productFinishOptionsTable.finishId, finishId),
          ),
        )
        .limit(1);
      if (!existingLink) {
        await db.insert(productFinishOptionsTable).values({
          productId,
          finishId,
          displayOrder: fi,
        });
      }
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} images_uploaded=${imagesUploaded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
