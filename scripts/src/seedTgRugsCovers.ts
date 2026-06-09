/**
 * Idempotent loader for Treasure Garden Outdoor Rugs + Protective Covers.
 *
 *   Source CSVs (latest by name) in attached_assets/:
 *     - TG_Rugs_and_Covers_product_list_*.csv   (category, name, SKU, features, size, …)
 *     - TG_Rugs_Covers_MSRP_and_sale_pricing_*.csv (category, name, SKU, size, MSRP, sale)
 *   Source images: <repo root>/tg_rugs_covers_images/<subfolder>/<KEY>.png
 *     - rugs: KEY = base SKU (no -35/-80 size suffix), shared by both sizes
 *     - covers: KEY = SKU
 *
 * Builds:
 *   Outdoor Rugs — ONE product per rug name (base SKU); price/salePrice = the
 *     5'3"x7'4" (-35) values. Two SIZE variants (-35, -80) under optionLabel
 *     "Size", each carrying its own absolute MSRP + sale price. The 7'10"x10'
 *     (-80) "Truck Only" size carries a $100 per-variant shipping surcharge.
 *   Protective Covers — ONE flat-priced product per SKU, no variants.
 *
 * Features CSV column → products.description (rendered whole in the PDP
 * "Features" tab, since there is no separate top blurb).
 *
 * Two flat categories are upserted: "Outdoor Rugs" and "Protective Covers".
 *
 * Idempotent: products upsert by sku, variants by variant_sku, images by
 * (product_id, url); categories upsert by slug; inventory checked before insert.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/seedTgRugsCovers.ts
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
  inventoryTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");
const IMAGES_ROOT = resolve(__dirname, "../../tg_rugs_covers_images");

const TG_SLUG = "treasure-garden";
const RUG_CATEGORY = { slug: "outdoor-rugs", name: "Outdoor Rugs" };
const COVER_CATEGORY = { slug: "protective-covers", name: "Protective Covers" };

const RUG_SHIPPING_SURCHARGE = "100.00"; // 7'10"x10' (-80) "Truck Only" size.

type ProductRow = {
  "Product Category": string;
  "Product Name": string;
  SKU: string;
  Features: string;
  Size: string;
  "Weight (lbs)": string;
  Cube: string;
  "Case Pack": string;
  Notes: string;
};

type PriceRow = {
  "Product Category": string;
  "Product Name": string;
  SKU: string;
  Size: string;
  MSRP: string;
  "Sale Price": string;
};

function findLatestCsv(prefix: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort();
  if (matches.length === 0) throw new Error(`No CSV found with prefix ${prefix}`);
  return join(ASSETS_DIR, matches[matches.length - 1]!);
}

/**
 * The product-list CSV is malformed: the Features column is wrapped in quotes
 * (it contains commas), but Size/Notes/Name fields contain bare inch-mark
 * quotes (7'10", 33" W) that are NOT escaped, which trips the CSV parser. Real
 * CSV quote delimiters here only ever follow a comma (opening) or a sentence
 * period (closing), never a digit or apostrophe — so converting any `"` that
 * is preceded by a digit or `'` into the inch symbol (″) removes the offending
 * marks without disturbing the genuine field delimiters. The negative lookahead
 * `(?!")` preserves rows that DO use proper `""` escaping (some fire-pit cover
 * Features), so we only rewrite truly bare inch marks. Must NOT be applied to
 * the pricing CSV, which uses proper "" escaping throughout.
 */
function fixInchQuotes(text: string): string {
  return text.replace(/([0-9'])"(?!")/g, "$1\u2033");
}

function parseCsv<T extends Record<string, string>>(
  path: string,
  preprocess?: (s: string) => string,
): T[] {
  let text = readFileSync(path, "utf8");
  if (preprocess) text = preprocess(text);
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

/** Parse a "$722" / "$1,234.50" money string → "722.00" (or null if blank). */
function parseMoney(v: string | undefined): string | null {
  const t = clean(v).replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/** Strip the trailing size suffix (-35 / -80) from a rug SKU → base SKU. */
function rugBaseSku(sku: string): string {
  return clean(sku).replace(/-(35|80)$/, "");
}

function isRug(category: string): boolean {
  return clean(category).toUpperCase().startsWith("OUTDOOR RUG");
}

function isCover(category: string): boolean {
  return clean(category).toUpperCase().startsWith("PROTECTIVE COVER");
}

async function lookupId(
  table: typeof manufacturersTable,
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

/** Upsert a flat (top-level) category by slug; returns its id. */
async function ensureCategory(
  cat: { slug: string; name: string },
  displayOrder: number,
): Promise<number> {
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, cat.slug))
    .limit(1);
  if (existing[0]) {
    await db
      .update(categoriesTable)
      .set({ name: cat.name, parentId: null, isActive: true })
      .where(eq(categoriesTable.id, existing[0].id));
    return existing[0].id;
  }
  const [created] = await db
    .insert(categoriesTable)
    .values({
      name: cat.name,
      slug: cat.slug,
      parentId: null,
      displayOrder,
      isActive: true,
    })
    .returning({ id: categoriesTable.id });
  if (!created) throw new Error(`Failed to create category ${cat.slug}`);
  return created.id;
}

/** Build a non-empty specs object from a product-list row. */
function buildSpecs(r: ProductRow): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string) => {
    const t = clean(v);
    if (t) out[k] = t;
  };
  add("Size", r.Size);
  add("Weight", r["Weight (lbs)"] ? `${clean(r["Weight (lbs)"])} lbs` : "");
  add("Cube", r.Cube);
  add("Case Pack", r["Case Pack"]);
  add("Shipping", r.Notes);
  return out;
}

function parseWeight(v: string | undefined): string | null {
  const m = clean(v).match(/([\d]+(?:\.[\d]+)?)/);
  return m ? m[1]! : null;
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

function safeFileToken(sku: string): string {
  return sku.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Flat index of every image: basename (no extension) → absolute path. */
/** Normalize an image/SKU key for matching: uppercase, drop hyphens/spaces. */
function normalizeImageKey(s: string): string {
  return s.toUpperCase().replace(/[-\s]/g, "");
}

function buildImageIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  if (!existsSync(IMAGES_ROOT)) return idx;
  for (const sub of readdirSync(IMAGES_ROOT)) {
    const subPath = join(IMAGES_ROOT, sub);
    if (!statSync(subPath).isDirectory()) continue;
    for (const f of readdirSync(subPath)) {
      const ext = extname(f);
      if (!ext) continue;
      const base = f.slice(0, -ext.length);
      idx.set(base, join(subPath, f));
      // Also index under a normalized key so SKUs like PFC406-C match a
      // PFC406C.png file (the source files omit the hyphen).
      idx.set(normalizeImageKey(base), join(subPath, f));
    }
  }
  return idx;
}

async function uploadProductImage(
  bucket: ReturnType<typeof objectStorage.bucket>,
  prefix: string,
  productId: number,
  imageKey: string,
  localPath: string,
  altText: string,
): Promise<void> {
  const ext = extname(localPath);
  const fileName = `TG_${safeFileToken(imageKey)}_primary${ext}`;
  const objectName = prefix
    ? `${prefix}/vendor-imports/${fileName}`
    : `vendor-imports/${fileName}`;
  const storedUrl = `/objects/vendor-imports/${fileName}`;
  await bucket.upload(localPath, {
    destination: objectName,
    contentType: contentTypeFor(ext),
    resumable: false,
  });
  await db
    .insert(productImagesTable)
    .values({
      productId,
      url: storedUrl,
      altText,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    })
    .onConflictDoUpdate({
      target: [productImagesTable.productId, productImagesTable.url],
      set: { isPrimary: true, displayOrder: 0, imageKind: "gallery", altText },
    });
}

type ProductUpsert = {
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  specs: Record<string, string>;
  weight: string | null;
  dimensions: string | null;
  price: string | null;
  salePrice: string | null;
  categoryId: number;
  displayOrder: number;
};

async function upsertProduct(
  p: ProductUpsert,
  tgId: number,
): Promise<{ id: number; created: boolean }> {
  const existing = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, p.sku))
    .limit(1);
  if (existing[0]) {
    await db
      .update(productsTable)
      .set({
        name: p.name,
        slug: p.slug,
        description: p.description,
        shortDescription: null,
        manufacturerId: tgId,
        categoryId: p.categoryId,
        specs: p.specs,
        weight: p.weight,
        dimensions: p.dimensions,
        price: p.price,
        salePrice: p.salePrice,
        showPriceOnline: true,
        availableOnline: true,
        inStoreOnly: false,
        quoteOnly: false,
        isActive: true,
        displayOrder: p.displayOrder,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }
  const [created] = await db
    .insert(productsTable)
    .values({
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      specs: p.specs,
      weight: p.weight,
      dimensions: p.dimensions,
      price: p.price,
      salePrice: p.salePrice,
      manufacturerId: tgId,
      categoryId: p.categoryId,
      displayOrder: p.displayOrder,
      showPriceOnline: true,
      availableOnline: true,
      inStoreOnly: false,
      featured: false,
      quoteOnly: false,
      lowStockThreshold: 0,
      isActive: true,
    })
    .returning({ id: productsTable.id });
  if (!created) throw new Error(`Failed to create product ${p.sku}`);
  return { id: created.id, created: true };
}

async function ensureVariantInventory(
  productId: number,
  variantId: number,
): Promise<boolean> {
  const inv = await db
    .select({ id: inventoryTable.id })
    .from(inventoryTable)
    .where(eq(inventoryTable.variantId, variantId))
    .limit(1);
  if (inv[0]) return false;
  await db.insert(inventoryTable).values({
    productId,
    variantId,
    onHand: 0,
    onHold: 0,
    reorderThreshold: 0,
  });
  return true;
}

async function ensureProductInventory(productId: number): Promise<boolean> {
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
  if (inv[0]) return false;
  await db.insert(inventoryTable).values({
    productId,
    variantId: null,
    onHand: 0,
    onHold: 0,
    reorderThreshold: 0,
  });
  return true;
}

async function main() {
  console.log("== Seeding Treasure Garden Rugs + Covers ==\n");
  const listPath = findLatestCsv("TG_Rugs_and_Covers_product_list_");
  const pricePath = findLatestCsv("TG_Rugs_Covers_MSRP_and_sale_pricing_");
  console.log(`Product list: ${listPath}`);
  console.log(`Pricing:      ${pricePath}\n`);

  const listRows = parseCsv<ProductRow>(listPath, fixInchQuotes).filter((r) =>
    clean(r.SKU),
  );
  const priceRows = parseCsv<PriceRow>(pricePath).filter((r) => clean(r.SKU));

  // Price map keyed by full SKU.
  const priceBySku = new Map<string, { msrp: string | null; sale: string | null }>();
  for (const pr of priceRows) {
    priceBySku.set(clean(pr.SKU), {
      msrp: parseMoney(pr.MSRP),
      sale: parseMoney(pr["Sale Price"]),
    });
  }

  const tgId = await lookupId(manufacturersTable, TG_SLUG, "Manufacturer");
  const rugCatId = await ensureCategory(RUG_CATEGORY, 90);
  const coverCatId = await ensureCategory(COVER_CATEGORY, 91);

  const imageIndex = buildImageIndex();
  const { bucket: bucketName, prefix } = parsePrivateDir();
  const bucket = objectStorage.bucket(bucketName);

  let rugProducts = 0;
  let coverProducts = 0;
  let variantsUpserted = 0;
  let invCreated = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  // ── Rugs: group rows by base SKU (one product, two size variants) ──────────
  type RugGroup = {
    baseSku: string;
    name: string;
    category: string;
    features: string;
    rows: ProductRow[];
  };
  const rugGroups = new Map<string, RugGroup>();
  for (const r of listRows) {
    if (!isRug(r["Product Category"])) continue;
    const baseSku = rugBaseSku(r.SKU);
    let g = rugGroups.get(baseSku);
    if (!g) {
      g = {
        baseSku,
        name: clean(r["Product Name"]) || baseSku,
        category: clean(r["Product Category"]),
        features: clean(r.Features),
        rows: [],
      };
      rugGroups.set(baseSku, g);
    }
    g.rows.push(r);
  }

  let rugIdx = 0;
  for (const g of rugGroups.values()) {
    // -35 (5'3"x7'4") drives the product-level base price.
    const sized = g.rows.map((r) => ({
      row: r,
      suffix: clean(r.SKU).slice(-2), // "35" | "80"
      price: priceBySku.get(clean(r.SKU)) ?? { msrp: null, sale: null },
    }));
    sized.sort((a, b) => (a.suffix === "35" ? -1 : 1) - (b.suffix === "35" ? -1 : 1));
    const small = sized.find((s) => s.suffix === "35") ?? sized[0]!;

    const { id: productId } = await upsertProduct(
      {
        name: g.name,
        slug: slugify(`${g.name}-${g.baseSku}`),
        sku: g.baseSku,
        description: g.features || null,
        specs: buildSpecs(small.row),
        weight: parseWeight(small.row["Weight (lbs)"]),
        dimensions: clean(small.row.Size) || null,
        price: small.price.msrp,
        salePrice: small.price.sale,
        categoryId: rugCatId,
        displayOrder: rugIdx,
      },
      tgId,
    );
    rugProducts += 1;

    for (let j = 0; j < sized.length; j++) {
      const s = sized[j]!;
      const fullSku = clean(s.row.SKU);
      const surcharge = s.suffix === "80" ? RUG_SHIPPING_SURCHARGE : "0";
      const variantValues = {
        productId,
        variantName: clean(s.row.Size) || fullSku,
        optionLabel: "Size",
        priceAdjustment: "0",
        msrp: s.price.msrp,
        salePrice: s.price.sale,
        shippingSurcharge: surcharge,
        weight: parseWeight(s.row["Weight (lbs)"]),
        displayOrder: j,
        isActive: true,
      };
      const ex = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.variantSku, fullSku))
        .limit(1);
      let variantId: number;
      if (ex[0]) {
        variantId = ex[0].id;
        await db
          .update(productVariantsTable)
          .set({ ...variantValues, updatedAt: new Date() })
          .where(eq(productVariantsTable.id, variantId));
      } else {
        const [c] = await db
          .insert(productVariantsTable)
          .values({ ...variantValues, variantSku: fullSku })
          .returning({ id: productVariantsTable.id });
        if (!c) throw new Error(`Failed to create variant ${fullSku}`);
        variantId = c.id;
      }
      variantsUpserted += 1;
      if (await ensureVariantInventory(productId, variantId)) invCreated += 1;
    }

    const imgPath =
      imageIndex.get(g.baseSku) ?? imageIndex.get(normalizeImageKey(g.baseSku));
    if (imgPath) {
      await uploadProductImage(bucket, prefix, productId, g.baseSku, imgPath, g.name);
      imagesUploaded += 1;
    } else {
      console.warn(`  ! no image for rug ${g.baseSku}`);
      imagesMissing += 1;
    }
    console.log(`  [rug] ${g.baseSku} — ${g.name} (${sized.length} sizes)`);
    rugIdx += 1;
  }

  // ── Covers: one flat-priced product per SKU, no variants ───────────────────
  let coverIdx = 0;
  for (const r of listRows) {
    if (!isCover(r["Product Category"])) continue;
    const sku = clean(r.SKU);
    const name = clean(r["Product Name"]) || sku;
    const price = priceBySku.get(sku) ?? { msrp: null, sale: null };

    const { id: productId } = await upsertProduct(
      {
        name,
        slug: slugify(`${name}-${sku}`),
        sku,
        description: clean(r.Features) || null,
        specs: buildSpecs(r),
        weight: parseWeight(r["Weight (lbs)"]),
        dimensions: clean(r.Size) || null,
        price: price.msrp,
        salePrice: price.sale,
        categoryId: coverCatId,
        displayOrder: 1000 + coverIdx,
      },
      tgId,
    );
    coverProducts += 1;
    if (await ensureProductInventory(productId)) invCreated += 1;

    const imgPath =
      imageIndex.get(sku) ?? imageIndex.get(normalizeImageKey(sku));
    if (imgPath) {
      await uploadProductImage(bucket, prefix, productId, sku, imgPath, name);
      imagesUploaded += 1;
    } else {
      console.warn(`  ! no image for cover ${sku}`);
      imagesMissing += 1;
    }
    console.log(`  [cover] ${sku} — ${name}`);
    coverIdx += 1;
  }

  console.log("\n== Summary ==");
  console.log(`  rug products:   ${rugProducts}`);
  console.log(`  cover products: ${coverProducts}`);
  console.log(`  variants:       upserted ${variantsUpserted}`);
  console.log(`  inventory:      created ${invCreated}`);
  console.log(`  images:         uploaded ${imagesUploaded}, missing ${imagesMissing}`);

  const verify = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM products WHERE category_id = ${rugCatId}) AS rug_products,
      (SELECT COUNT(*)::int FROM products WHERE category_id = ${coverCatId}) AS cover_products,
      (SELECT COUNT(*)::int FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE category_id = ${rugCatId})) AS rug_variants
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
