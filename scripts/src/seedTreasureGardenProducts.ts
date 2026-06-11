/**
 * Idempotent loader for the fresh Treasure Garden product drop.
 *
 *   Source CSV: attached_assets/tg_products_all_*.csv  (latest by name)
 *   Source img: <repo root>/tg_images/<ITEM_NO>/{primary,gallery_N}.{jpg,png}
 *               or flat <repo root>/tg_images/<ITEM_NO>_{primary,gallery_N}.png
 *
 * Builds, per CSV row:
 *   - products            (manufacturer = existing Treasure Garden, no price yet,
 *                          available online, show price online, not quote-only)
 *   - product_variants    (one per finish in `available_finishes`, optionLabel
 *                          "Frame Finish" for umbrellas / "Base Finish" for bases)
 *   - inventory           (per variant; or a single variant-null row when the
 *                          product has no finishes — respects the variant-vs-null
 *                          inventory-mode exclusivity)
 *   - product_fabric_options (umbrella categories → all Sunbrella fabrics)
 *   - product_images      (object storage upload + rows, imageKind "gallery")
 *
 * Does NOT touch the `finishes` table or finish swatch images — variant rows
 * store the finish name as free text, so no finish library dependency.
 *
 * Idempotent: products upsert by sku, variants by variant_sku, images by
 * (product_id, url); fabric links + inventory are checked before insert.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/seedTreasureGardenProducts.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { eq, sql, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  categoriesTable,
  productsTable,
  productImagesTable,
  productVariantsTable,
  fabricsTable,
  productFabricOptionsTable,
  inventoryTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");
const IMAGES_DIR = resolve(__dirname, "../../tg_images");

const TG_SLUG = "treasure-garden";
const UMBRELLA_CATEGORY_SLUG = "cat-umbrellas";
const BASE_CATEGORY_SLUG = "cat-umbrella-bases";

const UMBRELLA_CATEGORIES = new Set(["Cantilever", "Specialty", "Market"]);
const BASE_CATEGORIES = new Set(["Base", "Cantilever Base"]);

type ProductRow = {
  category: string;
  product_name: string;
  item_no: string;
  is_new: string;
  quick_ship: string;
  size: string;
  shape: string;
  ribs: string;
  pole_diameter: string;
  bottom_pole: string;
  vent: string;
  lift: string;
  tilt: string;
  weight: string;
  cube: string;
  min_base_weight: string;
  available_finishes: string;
  fabric_restriction_note: string;
  shipping: string;
  frame_part: string;
  canopy_part: string;
};

function findLatestCsv(prefix: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort();
  if (matches.length === 0) throw new Error(`No CSV found with prefix ${prefix}`);
  return join(ASSETS_DIR, matches[matches.length - 1]!);
}

function parseCsv<T extends Record<string, string>>(path: string): T[] {
  const text = readFileSync(path, "utf8");
  const r = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (r.errors.length > 0) {
    throw new Error(`CSV parse error in ${path}: ${r.errors[0]?.message}`);
  }
  return r.data;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

function isTrue(v: string | undefined): boolean {
  return clean(v).toLowerCase() === "true";
}

async function lookupId(
  table: typeof manufacturersTable | typeof categoriesTable,
  slug: string,
  label: string,
): Promise<number> {
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  if (!rows[0]) throw new Error(`${label} with slug "${slug}" not found`);
  return rows[0].id;
}

/** Build a human-readable specs object (only non-empty fields). */
function buildSpecs(r: ProductRow): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string) => {
    const t = clean(v);
    if (t) out[k] = t;
  };
  add("Category", r.category);
  add("Size", r.size);
  add("Shape", r.shape);
  add("Ribs", r.ribs);
  add("Pole Diameter", r.pole_diameter);
  add("Bottom Pole", r.bottom_pole);
  add("Vent", r.vent);
  add("Lift", r.lift);
  add("Tilt", r.tilt);
  add("Weight", r.weight);
  add("Cube", r.cube);
  add("Min Base Weight", r.min_base_weight);
  add("Shipping", r.shipping);
  add("Frame Part", r.frame_part);
  add("Canopy Part", r.canopy_part);
  add("Fabric Restriction", r.fabric_restriction_note);
  if (isTrue(r.is_new)) out["New"] = "Yes";
  if (isTrue(r.quick_ship)) out["Quick Ship"] = "Yes";
  return out;
}

/** Parse the first numeric token out of a free-text weight like "DWV 108 lbs.". */
function parseWeight(v: string): string | null {
  const m = clean(v).match(/([\d]+(?:\.[\d]+)?)/);
  return m ? m[1]! : null;
}

/** Parse `available_finishes` ("SKU: Name | SKU: Name") into {sku, name} pairs. */
function parseFinishes(v: string): Array<{ sku: string; name: string }> {
  const raw = clean(v);
  if (!raw) return [];
  const out: Array<{ sku: string; name: string }> = [];
  for (const part of raw.split("|")) {
    const p = part.trim();
    if (!p) continue;
    const colon = p.indexOf(":");
    if (colon === -1) continue;
    const sku = p.slice(0, colon).trim();
    const name = p
      .slice(colon + 1)
      .trim()
      .replace(/,+$/, "")
      .trim();
    if (!sku || !name) continue;
    out.push({ sku, name });
  }
  return out;
}

// ── object storage ──────────────────────────────────────────────────────────
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

function contentTypeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

type LocalImage = { role: "primary" | "gallery"; order: number; localPath: string };

/** Resolve the local image files for a SKU (per-SKU dir or flat files). */
function imagesForSku(sku: string): LocalImage[] {
  const out: LocalImage[] = [];
  const dirPath = join(IMAGES_DIR, sku);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    for (const name of readdirSync(dirPath)) {
      const ext = extname(name);
      const base = name.slice(0, -ext.length);
      if (base === "primary") {
        out.push({ role: "primary", order: 0, localPath: join(dirPath, name) });
      } else {
        const m = base.match(/^gallery_(\d+)$/);
        if (m) {
          out.push({
            role: "gallery",
            order: Number(m[1]),
            localPath: join(dirPath, name),
          });
        }
      }
    }
  } else {
    // Flat files: <sku>_primary.ext / <sku>_gallery_N.ext
    for (const name of readdirSync(IMAGES_DIR)) {
      const full = join(IMAGES_DIR, name);
      if (statSync(full).isDirectory()) continue;
      const ext = extname(name);
      const base = name.slice(0, -ext.length);
      if (base === `${sku}_primary`) {
        out.push({ role: "primary", order: 0, localPath: full });
      } else {
        const m = base.match(new RegExp(`^${escapeRe(sku)}_gallery_(\\d+)$`));
        if (m) {
          out.push({ role: "gallery", order: Number(m[1]), localPath: full });
        }
      }
    }
  }
  // primary first, then gallery by numeric order
  out.sort((a, b) => {
    if (a.role !== b.role) return a.role === "primary" ? -1 : 1;
    return a.order - b.order;
  });
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeFileToken(sku: string): string {
  return sku.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function main() {
  console.log("== Seeding Treasure Garden products ==\n");
  const csvPath = findLatestCsv("tg_products_all_");
  console.log(`CSV: ${csvPath}`);
  const rows = parseCsv<ProductRow>(csvPath).filter((r) => clean(r.item_no));
  console.log(`Parsed ${rows.length} product rows\n`);

  const tgId = await lookupId(manufacturersTable, TG_SLUG, "Manufacturer");
  const umbrellaCatId = await lookupId(
    categoriesTable,
    UMBRELLA_CATEGORY_SLUG,
    "Category",
  );
  const baseCatId = await lookupId(
    categoriesTable,
    BASE_CATEGORY_SLUG,
    "Category",
  );

  // Treasure Garden's OWN active fabrics for umbrella canopy options. Umbrellas
  // no longer use Sunbrella fabrics.
  const tgFabricRows = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(
      and(eq(fabricsTable.manufacturerId, tgId), eq(fabricsTable.isActive, true)),
    )
    .orderBy(fabricsTable.name);
  const tgFabricIds = tgFabricRows.map((f) => f.id);
  console.log(`Treasure Garden fabrics available for linking: ${tgFabricIds.length}\n`);

  const { bucket: bucketName, prefix } = parsePrivateDir();
  const bucket = objectStorage.bucket(bucketName);

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let invCreated = 0;
  let fabricLinksCreated = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const sku = clean(r.item_no);
    const name = clean(r.product_name) || sku;
    const isUmbrella = UMBRELLA_CATEGORIES.has(clean(r.category));
    const isBase = BASE_CATEGORIES.has(clean(r.category));
    const categoryId = isBase ? baseCatId : umbrellaCatId;
    const slug = slugify(`${name}-${sku}`);
    const specs = buildSpecs(r);
    const weight = parseWeight(r.weight);
    const dimensions = clean(r.size) || null;
    const shortDescription = isBase
      ? `Treasure Garden umbrella base${clean(r.size) ? ` · ${clean(r.size)}` : ""}`
      : `${clean(r.size)} ${clean(r.shape)} ${clean(r.category)} umbrella`.trim();

    // ── product upsert by sku ────────────────────────────────────────────────
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);
    let productId: number;
    if (existing[0]) {
      productId = existing[0].id;
      await db
        .update(productsTable)
        .set({
          name,
          slug,
          manufacturerId: tgId,
          categoryId,
          shortDescription,
          specs,
          weight,
          dimensions,
          showPriceOnline: true,
          availableOnline: true,
          inStoreOnly: false,
          quoteOnly: isUmbrella,
          isActive: true,
          displayOrder: i,
          updatedAt: new Date(),
        })
        .where(eq(productsTable.id, productId));
      productsUpdated += 1;
    } else {
      const [created] = await db
        .insert(productsTable)
        .values({
          name,
          slug,
          sku,
          shortDescription,
          specs,
          weight,
          dimensions,
          manufacturerId: tgId,
          categoryId,
          displayOrder: i,
          showPriceOnline: true,
          availableOnline: true,
          inStoreOnly: false,
          featured: false,
          quoteOnly: isUmbrella,
          lowStockThreshold: 0,
          isActive: true,
        })
        .returning({ id: productsTable.id });
      if (!created) throw new Error(`Failed to create product ${sku}`);
      productId = created.id;
      productsCreated += 1;
    }

    // ── finish variants ──────────────────────────────────────────────────────
    const finishes = parseFinishes(r.available_finishes);
    const optionLabel = isBase ? "Base Finish" : "Frame Finish";
    const variantIds: number[] = [];
    for (let j = 0; j < finishes.length; j++) {
      const f = finishes[j]!;
      const ex = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.variantSku, f.sku))
        .limit(1);
      let variantId: number;
      if (ex[0]) {
        variantId = ex[0].id;
        await db
          .update(productVariantsTable)
          .set({
            productId,
            variantName: f.name,
            optionLabel,
            displayOrder: j,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(productVariantsTable.id, variantId));
      } else {
        const [c] = await db
          .insert(productVariantsTable)
          .values({
            productId,
            variantSku: f.sku,
            variantName: f.name,
            optionLabel,
            priceAdjustment: "0",
            displayOrder: j,
            isActive: true,
          })
          .returning({ id: productVariantsTable.id });
        if (!c) throw new Error(`Failed to create variant ${f.sku}`);
        variantId = c.id;
        variantsCreated += 1;
      }
      variantIds.push(variantId);
    }

    // ── inventory (variant rows, or a single variant-null row) ───────────────
    if (variantIds.length > 0) {
      for (const variantId of variantIds) {
        const inv = await db
          .select({ id: inventoryTable.id })
          .from(inventoryTable)
          .where(eq(inventoryTable.variantId, variantId))
          .limit(1);
        if (!inv[0]) {
          await db.insert(inventoryTable).values({
            productId,
            variantId,
            onHand: 0,
            onHold: 0,
            reorderThreshold: 0,
          });
          invCreated += 1;
        }
      }
    } else {
      const inv = await db
        .select({ id: inventoryTable.id })
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.productId, productId),
            sql`${inventoryTable.variantId} IS NULL`,
          ),
        )
        .limit(1);
      if (!inv[0]) {
        await db.insert(inventoryTable).values({
          productId,
          variantId: null,
          onHand: 0,
          onHold: 0,
          reorderThreshold: 0,
        });
        invCreated += 1;
      }
    }

    // ── fabric options (umbrellas only) ──────────────────────────────────────
    // Bulk insert with ON CONFLICT DO NOTHING against the (product_id, fabric_id)
    // unique key — one round-trip per product instead of per link.
    if (isUmbrella && tgFabricIds.length > 0) {
      const rowsToInsert = tgFabricIds.map((fabricId, k) => ({
        productId,
        fabricId,
        displayOrder: k,
      }));
      const inserted = await db
        .insert(productFabricOptionsTable)
        .values(rowsToInsert)
        .onConflictDoNothing({
          target: [
            productFabricOptionsTable.productId,
            productFabricOptionsTable.fabricId,
          ],
        })
        .returning({ id: productFabricOptionsTable.id });
      fabricLinksCreated += inserted.length;
    }

    // ── images ───────────────────────────────────────────────────────────────
    const localImages = imagesForSku(sku);
    if (localImages.length === 0) {
      console.warn(`  ! no images found for SKU ${sku}`);
      imagesMissing += 1;
    }
    for (const img of localImages) {
      const ext = extname(img.localPath);
      const token = safeFileToken(sku);
      const fileName =
        img.role === "primary"
          ? `TG_${token}_primary${ext}`
          : `TG_${token}_gallery_${img.order}${ext}`;
      const objectName = prefix
        ? `${prefix}/vendor-imports/${fileName}`
        : `vendor-imports/${fileName}`;
      const storedUrl = `/objects/vendor-imports/${fileName}`;
      await bucket.upload(img.localPath, {
        destination: objectName,
        contentType: contentTypeFor(ext),
        resumable: false,
      });
      imagesUploaded += 1;
      await db
        .insert(productImagesTable)
        .values({
          productId,
          url: storedUrl,
          altText: name,
          isPrimary: img.role === "primary",
          displayOrder: img.role === "primary" ? 0 : img.order,
          imageKind: "gallery",
        })
        .onConflictDoUpdate({
          target: [productImagesTable.productId, productImagesTable.url],
          set: {
            isPrimary: img.role === "primary",
            displayOrder: img.role === "primary" ? 0 : img.order,
            imageKind: "gallery",
            altText: name,
          },
        });
    }

    console.log(
      `  [${i + 1}/${rows.length}] ${sku} — ${finishes.length} finishes, ${localImages.length} images`,
    );
  }

  console.log("\n== Summary ==");
  console.log(`  products:     created ${productsCreated}, updated ${productsUpdated}`);
  console.log(`  variants:     created ${variantsCreated}`);
  console.log(`  inventory:    created ${invCreated}`);
  console.log(`  fabric links: created ${fabricLinksCreated}`);
  console.log(`  images:       uploaded ${imagesUploaded}, SKUs missing images ${imagesMissing}`);

  const verify = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM products WHERE manufacturer_id = ${tgId}) AS products,
      (SELECT COUNT(*)::int FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE manufacturer_id = ${tgId})) AS variants,
      (SELECT COUNT(*)::int FROM product_images WHERE product_id IN (
        SELECT id FROM products WHERE manufacturer_id = ${tgId})) AS images,
      (SELECT COUNT(*)::int FROM finishes WHERE manufacturer_id = ${tgId}) AS finishes_preserved
  `);
  console.log("\n== Verification ==");
  console.log(verify.rows[0]);
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
