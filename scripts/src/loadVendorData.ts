/**
 * One-shot idempotent loader for the initial vendor data drop:
 *   - 100 Sunbrella upholstery fabrics  → fabrics
 *   - 14 Treasure Garden market umbrellas → products + inventory
 *   - 43 frame-finish variants          → product_variants + inventory
 *   - Every umbrella linked to all 100 fabrics → product_fabric_options
 *   - Per-model attributes (Feature/Option/Replacement Part) → product_attributes
 *   - Sample model images (gallery + spec) → object storage + product_images
 *
 * Idempotent: re-running updates existing rows by natural key (item_number,
 * sku) and skips already-present links. Attributes are wiped per product and
 * re-inserted (vendor sheet is the source of truth). Images are uploaded to
 * deterministic object-storage paths so re-uploads overwrite cleanly, and
 * product_images rows are upserted by URL.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/loadVendorData.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { eq, sql, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  categoriesTable,
  productsTable,
  productAttributesTable,
  productImagesTable,
  productVariantsTable,
  fabricsTable,
  productFabricOptionsTable,
  inventoryTable,
} from "@workspace/db";

// Anchor to repo root so the script works regardless of cwd (pnpm/tsx shifts
// cwd to the package directory).
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");

function findLatest(prefix: string): string {
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

async function ensureManufacturer(name: string): Promise<number> {
  const existing = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(sql`LOWER(${manufacturersTable.name}) = LOWER(${name})`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(manufacturersTable)
    .values({ name, slug: slugify(name), displayOrder: 0, isActive: true })
    .returning({ id: manufacturersTable.id });
  if (!created) throw new Error(`Failed to create manufacturer ${name}`);
  console.log(`  + manufacturer "${name}" (id=${created.id})`);
  return created.id;
}

async function ensureCategory(
  name: string,
  parentId: number | null,
): Promise<number> {
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(sql`LOWER(${categoriesTable.name}) = LOWER(${name})`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(categoriesTable)
    .values({
      name,
      slug: slugify(name),
      parentId,
      displayOrder: 0,
      isActive: true,
    })
    .returning({ id: categoriesTable.id });
  if (!created) throw new Error(`Failed to create category ${name}`);
  console.log(`  + category "${name}" (id=${created.id}, parent=${parentId})`);
  return created.id;
}

type FabricRow = {
  Manufacturer: string;
  "Fabric Name": string;
  "Item Number": string;
};

type UmbrellaRow = {
  Manufacturer: string;
  "Item Name": string;
  "Item Number": string;
  Collection: string;
  Size: string;
  Shape: string;
  Ribs: string;
  "Rib Diameter": string;
  "Pole Diameter": string;
  "Pole Thickness": string;
  "Bottom Pole": string;
  Vent: string;
  Lift: string;
  Tilt: string;
  "Weight (SWV)": string;
  "Weight (DWV)": string;
  Cube: string;
  "Min Base Weight (lbs)": string;
  "Coverage (sq ft)": string;
  Notes: string;
};

type VariantRow = {
  Manufacturer: string;
  "Base Item Number": string;
  "Item Name": string;
  "Variant Item Number": string;
  "Finish / Color": string;
};

type AttributeRow = {
  Manufacturer: string;
  "Item Number": string;
  "Item Name": string;
  "Attribute Type": string;
  "Attribute / Part Name": string;
  "Value / Description": string;
};

const ATTRIBUTE_TYPE_MAP: Record<string, "feature" | "option" | "replacement_part"> = {
  Feature: "feature",
  Option: "option",
  "Replacement Part": "replacement_part",
};

async function loadFabrics(
  rows: FabricRow[],
  sunbrellaId: number,
): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const itemNumber = r["Item Number"].trim();
    const name = r["Fabric Name"].trim();
    const existing = await db
      .select({ id: fabricsTable.id })
      .from(fabricsTable)
      .where(eq(fabricsTable.itemNumber, itemNumber))
      .limit(1);
    if (existing[0]) {
      await db
        .update(fabricsTable)
        .set({ name, manufacturerId: sunbrellaId, displayOrder: i })
        .where(eq(fabricsTable.id, existing[0].id));
      updated += 1;
    } else {
      await db.insert(fabricsTable).values({
        itemNumber,
        name,
        manufacturerId: sunbrellaId,
        displayOrder: i,
        isActive: true,
      });
      created += 1;
    }
  }
  return { created, updated, total: rows.length };
}

function buildSpecs(r: UmbrellaRow): Record<string, string> {
  const fields: Array<[string, string]> = [
    ["collection", r.Collection],
    ["size", r.Size],
    ["shape", r.Shape],
    ["ribs", r.Ribs],
    ["ribDiameter", r["Rib Diameter"]],
    ["poleDiameter", r["Pole Diameter"]],
    ["poleThickness", r["Pole Thickness"]],
    ["bottomPole", r["Bottom Pole"]],
    ["vent", r.Vent],
    ["lift", r.Lift],
    ["tilt", r.Tilt],
    ["weightSwv", r["Weight (SWV)"]],
    ["weightDwv", r["Weight (DWV)"]],
    ["cube", r.Cube],
    ["minBaseWeightLbs", r["Min Base Weight (lbs)"]],
    ["coverageSqFt", r["Coverage (sq ft)"]],
    ["notes", r.Notes],
  ];
  const out: Record<string, string> = {};
  for (const [k, v] of fields) {
    const t = (v ?? "").trim();
    if (t) out[k] = t;
  }
  return out;
}

async function loadUmbrellas(
  rows: UmbrellaRow[],
  manufacturerId: number,
  categoryId: number,
): Promise<{
  created: number;
  updated: number;
  total: number;
  byItemNumber: Map<string, number>;
}> {
  let created = 0;
  let updated = 0;
  const byItemNumber = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const sku = r["Item Number"].trim();
    const name = r["Item Name"].trim();
    const slug = slugify(`${name}-${sku}`);
    const specs = buildSpecs(r);
    const description = specs.notes ?? null;
    const shortDescription = `${specs.size} ${specs.shape} market umbrella · ${specs.lift} lift, ${specs.tilt} tilt`;

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
          manufacturerId,
          categoryId,
          shortDescription,
          description,
          specs,
          updatedAt: new Date(),
        })
        .where(eq(productsTable.id, productId));
      updated += 1;
    } else {
      const [createdRow] = await db
        .insert(productsTable)
        .values({
          name,
          slug,
          sku,
          shortDescription,
          description,
          specs,
          manufacturerId,
          categoryId,
          displayOrder: i,
          showPriceOnline: true,
          availableOnline: true,
          inStoreOnly: false,
          featured: false,
          lowStockThreshold: 0,
          isActive: true,
        })
        .returning({ id: productsTable.id });
      if (!createdRow) throw new Error(`Failed to create product ${sku}`);
      productId = createdRow.id;
      created += 1;
    }
    byItemNumber.set(sku, productId);
  }
  return { created, updated, total: rows.length, byItemNumber };
}

async function loadVariants(
  rows: VariantRow[],
  productByItemNumber: Map<string, number>,
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  variantIds: number[];
}> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const variantIds: number[] = [];
  // Group by base SKU so display_order resets per product
  const byBase = new Map<string, VariantRow[]>();
  for (const r of rows) {
    const base = r["Base Item Number"].trim();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(r);
  }
  for (const [baseSku, group] of byBase) {
    const productId = productByItemNumber.get(baseSku);
    if (!productId) {
      console.warn(`  ! variant base "${baseSku}" has no matching product, skipping group`);
      skipped += group.length;
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      const r = group[i]!;
      const variantSku = r["Variant Item Number"].trim();
      const variantName = r["Finish / Color"].trim();
      const existing = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.variantSku, variantSku))
        .limit(1);
      let variantId: number;
      if (existing[0]) {
        variantId = existing[0].id;
        await db
          .update(productVariantsTable)
          .set({
            productId,
            variantName,
            optionLabel: "Frame Finish",
            displayOrder: i,
            updatedAt: new Date(),
          })
          .where(eq(productVariantsTable.id, variantId));
        updated += 1;
      } else {
        const [c] = await db
          .insert(productVariantsTable)
          .values({
            productId,
            variantSku,
            variantName,
            optionLabel: "Frame Finish",
            priceAdjustment: "0",
            displayOrder: i,
            isActive: true,
          })
          .returning({ id: productVariantsTable.id });
        if (!c) throw new Error(`Failed to create variant ${variantSku}`);
        variantId = c.id;
        created += 1;
      }
      variantIds.push(variantId);
    }
  }
  return { created, updated, skipped, variantIds };
}

async function ensureVariantInventory(
  variantIds: number[],
): Promise<{ created: number; existed: number }> {
  let created = 0;
  let existed = 0;
  for (const variantId of variantIds) {
    // Look up the variant's product_id
    const v = await db
      .select({ productId: productVariantsTable.productId })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.id, variantId))
      .limit(1);
    if (!v[0]) continue;
    const inv = await db
      .select({ id: inventoryTable.id })
      .from(inventoryTable)
      .where(eq(inventoryTable.variantId, variantId))
      .limit(1);
    if (inv[0]) {
      existed += 1;
    } else {
      await db.insert(inventoryTable).values({
        productId: v[0].productId,
        variantId,
        onHand: 0,
        onHold: 0,
        reorderThreshold: 0,
      });
      created += 1;
    }
  }
  return { created, existed };
}

async function linkAllFabrics(
  productIds: number[],
  fabricIds: number[],
): Promise<{ created: number; existed: number }> {
  let created = 0;
  let existed = 0;
  for (const productId of productIds) {
    for (let i = 0; i < fabricIds.length; i++) {
      const fabricId = fabricIds[i]!;
      const existing = await db
        .select({ id: productFabricOptionsTable.id })
        .from(productFabricOptionsTable)
        .where(
          and(
            eq(productFabricOptionsTable.productId, productId),
            eq(productFabricOptionsTable.fabricId, fabricId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        existed += 1;
      } else {
        await db.insert(productFabricOptionsTable).values({
          productId,
          fabricId,
          displayOrder: i,
        });
        created += 1;
      }
    }
  }
  return { created, existed };
}

// ───────────────────────────────────────────────────────────────────────────
// Attributes loader (Feature / Option / Replacement Part per model)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Per-product wipe-then-reinsert. The vendor sheet is the source of truth;
 * if the vendor drops a feature, we drop it too. Wrapped in a tx per product
 * so a partial failure doesn't leave a half-populated attribute list.
 */
async function loadAttributes(
  rows: AttributeRow[],
  productByItemNumber: Map<string, number>,
): Promise<{ products: number; inserted: number; skipped: number }> {
  // Group by SKU, preserving CSV row order for display_order.
  const bySku = new Map<string, AttributeRow[]>();
  for (const r of rows) {
    const sku = r["Item Number"]?.trim();
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku)!.push(r);
  }

  let products = 0;
  let inserted = 0;
  let skipped = 0;

  for (const [sku, group] of bySku) {
    const productId = productByItemNumber.get(sku);
    if (!productId) {
      console.warn(`  ! attributes for SKU "${sku}" have no matching product, skipping group`);
      skipped += group.length;
      continue;
    }

    const values: Array<{
      productId: number;
      attributeType: "feature" | "option" | "replacement_part";
      partName: string | null;
      value: string;
      displayOrder: number;
    }> = [];

    for (let i = 0; i < group.length; i++) {
      const r = group[i]!;
      const rawType = (r["Attribute Type"] ?? "").trim();
      const type = ATTRIBUTE_TYPE_MAP[rawType];
      if (!type) {
        console.warn(`  ! unknown attribute type "${rawType}" for SKU ${sku}, skipping`);
        skipped += 1;
        continue;
      }
      const partName = (r["Attribute / Part Name"] ?? "").trim() || null;
      const value = (r["Value / Description"] ?? "").trim();
      if (!value) {
        console.warn(`  ! empty value for SKU ${sku} (${type}), skipping`);
        skipped += 1;
        continue;
      }
      // CHECK constraint: replacement_part requires part_name; others forbid it.
      if (type === "replacement_part" && !partName) {
        console.warn(`  ! replacement_part for SKU ${sku} missing part name, skipping`);
        skipped += 1;
        continue;
      }
      if (type !== "replacement_part" && partName) {
        // Vendor sometimes leaves stray text in part_name for features/options;
        // null it out to satisfy the CHECK constraint.
        values.push({ productId, attributeType: type, partName: null, value, displayOrder: i });
      } else {
        values.push({ productId, attributeType: type, partName, value, displayOrder: i });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(productAttributesTable)
        .where(eq(productAttributesTable.productId, productId));
      if (values.length > 0) {
        await tx.insert(productAttributesTable).values(values);
      }
    });
    products += 1;
    inserted += values.length;
  }

  return { products, inserted, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// Image loader (gallery + spec drawings)
// ───────────────────────────────────────────────────────────────────────────

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

/** Parse `/bucket-name/some/path` into { bucket, prefix }. */
function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { bucket: trimmed, prefix: "" };
  }
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

const FILENAME_RE = /^TG_([A-Z0-9]+?)(_Specs)?_\d+\.png$/i;

type ImagePlan = {
  sku: string;
  kind: "gallery" | "spec";
  localPath: string;
  objectName: string; // path inside bucket
  storedUrl: string; // path stored in DB
};

function planImages(): ImagePlan[] {
  const { prefix } = parsePrivateDir();
  const dir = ASSETS_DIR;
  const plans: ImagePlan[] = [];
  for (const name of readdirSync(dir)) {
    const m = name.match(FILENAME_RE);
    if (!m) continue;
    const sku = m[1]!.toUpperCase();
    const kind: "gallery" | "spec" = m[2] ? "spec" : "gallery";
    const fileName = `TG_${sku}_${kind}.png`;
    const objectName = prefix ? `${prefix}/vendor-imports/${fileName}` : `vendor-imports/${fileName}`;
    const storedUrl = `/objects/vendor-imports/${fileName}`;
    plans.push({
      sku,
      kind,
      localPath: join(dir, name),
      objectName,
      storedUrl,
    });
  }
  // Stable order: SKU asc, gallery before spec
  plans.sort((a, b) => {
    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
    return a.kind === "gallery" ? -1 : 1;
  });
  return plans;
}

async function loadImages(
  productByItemNumber: Map<string, number>,
): Promise<{
  uploaded: number;
  rowsCreated: number;
  rowsExisted: number;
  skipped: number;
}> {
  const plans = planImages();
  if (plans.length === 0) {
    console.log("  (no TG_*.png files found in attached_assets)");
    return { uploaded: 0, rowsCreated: 0, rowsExisted: 0, skipped: 0 };
  }
  const { bucket: bucketName } = parsePrivateDir();
  const bucket = objectStorage.bucket(bucketName);

  let uploaded = 0;
  let rowsCreated = 0;
  let rowsExisted = 0;
  let skipped = 0;

  for (const plan of plans) {
    const productId = productByItemNumber.get(plan.sku);
    if (!productId) {
      console.warn(`  ! no product for SKU ${plan.sku}, skipping ${plan.localPath}`);
      skipped += 1;
      continue;
    }

    // Always upload (overwrite). Cheap and guarantees content matches.
    await bucket.upload(plan.localPath, {
      destination: plan.objectName,
      contentType: "image/png",
      resumable: false,
    });
    uploaded += 1;

    // True upsert via the (product_id, url) unique key — idempotent and race-safe.
    // RETURNING xmax tells us whether a new row was created (xmax = 0) or the
    // existing one was updated.
    const result = await db
      .insert(productImagesTable)
      .values({
        productId,
        url: plan.storedUrl,
        altText: null,
        // Gallery images mark the first one primary; spec images never primary.
        isPrimary: plan.kind === "gallery",
        displayOrder: 0,
        imageKind: plan.kind,
      })
      .onConflictDoUpdate({
        target: [productImagesTable.productId, productImagesTable.url],
        set: { imageKind: plan.kind, isPrimary: plan.kind === "gallery" },
      })
      .returning({
        id: productImagesTable.id,
        created: sql<boolean>`xmax = 0`,
      });

    if (result[0]?.created) rowsCreated += 1;
    else rowsExisted += 1;
  }

  return { uploaded, rowsCreated, rowsExisted, skipped };
}

async function main() {
  console.log("== Loading vendor data ==\n");
  const fabricsCsv = findLatest("sunbrella_upholstery_fabrics_");
  const umbrellasCsv = findLatest("treasure_garden_market_umbrellas_1");
  const optionsCsv = findLatest("treasure_garden_market_umbrellas_options_");
  const attributesCsv = findLatest("treasure_garden_market_umbrella_attributes_");

  console.log(`fabrics:    ${fabricsCsv}`);
  console.log(`umbrellas:  ${umbrellasCsv}`);
  console.log(`options:    ${optionsCsv}`);
  console.log(`attributes: ${attributesCsv}\n`);

  const fabricRows = parseCsv<FabricRow>(fabricsCsv);
  const umbrellaRows = parseCsv<UmbrellaRow>(umbrellasCsv);
  const variantRows = parseCsv<VariantRow>(optionsCsv);
  const attributeRows = parseCsv<AttributeRow>(attributesCsv);

  console.log(
    `Parsed: ${fabricRows.length} fabrics, ${umbrellaRows.length} umbrellas, ${variantRows.length} variants, ${attributeRows.length} attributes\n`,
  );

  console.log("[1/8] Ensuring manufacturers + category");
  const sunbrellaId = await ensureManufacturer("Sunbrella");
  const treasureGardenId = await ensureManufacturer("Treasure Garden");
  // Find or create the parent "Umbrellas & Shade" → child "Market Umbrellas"
  const parentCat = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(sql`LOWER(${categoriesTable.name}) = LOWER('Umbrellas & Shade')`)
    .limit(1);
  const parentId = parentCat[0]?.id ?? (await ensureCategory("Umbrellas & Shade", null));
  const marketCategoryId = await ensureCategory("Market Umbrellas", parentId);

  console.log("\n[2/8] Loading fabrics");
  const fabResult = await loadFabrics(fabricRows, sunbrellaId);
  console.log(`  fabrics: created ${fabResult.created}, updated ${fabResult.updated}`);

  console.log("\n[3/8] Loading umbrella products");
  const prodResult = await loadUmbrellas(umbrellaRows, treasureGardenId, marketCategoryId);
  console.log(
    `  products: created ${prodResult.created}, updated ${prodResult.updated}`,
  );

  console.log("\n[4/8] Loading frame-finish variants");
  const varResult = await loadVariants(variantRows, prodResult.byItemNumber);
  console.log(
    `  variants: created ${varResult.created}, updated ${varResult.updated}, skipped ${varResult.skipped}`,
  );

  console.log("\n[5/8] Ensuring per-variant inventory rows");
  const invResult = await ensureVariantInventory(varResult.variantIds);
  console.log(`  inventory: created ${invResult.created}, existed ${invResult.existed}`);

  console.log("\n[6/8] Linking every umbrella → every fabric");
  const allFabrics = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(eq(fabricsTable.manufacturerId, sunbrellaId));
  const productIds = Array.from(prodResult.byItemNumber.values());
  const linkResult = await linkAllFabrics(
    productIds,
    allFabrics.map((f) => f.id),
  );
  console.log(`  links: created ${linkResult.created}, existed ${linkResult.existed}`);

  console.log("\n[7/8] Loading per-model attributes (features/options/parts)");
  const attrResult = await loadAttributes(attributeRows, prodResult.byItemNumber);
  console.log(
    `  attributes: ${attrResult.products} products, ${attrResult.inserted} rows inserted, ${attrResult.skipped} skipped`,
  );

  console.log("\n[8/8] Uploading sample images + linking to product_images");
  const imgResult = await loadImages(prodResult.byItemNumber);
  console.log(
    `  images: ${imgResult.uploaded} uploaded, ${imgResult.rowsCreated} rows created, ${imgResult.rowsExisted} rows existed, ${imgResult.skipped} skipped`,
  );

  // Final verification
  console.log("\n== Verification ==");
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM fabrics) AS fabrics,
      (SELECT COUNT(*)::int FROM products WHERE manufacturer_id = ${treasureGardenId}) AS umbrellas,
      (SELECT COUNT(*)::int FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE manufacturer_id = ${treasureGardenId}
      )) AS variants,
      (SELECT COUNT(*)::int FROM product_fabric_options) AS fabric_links,
      (SELECT COUNT(*)::int FROM inventory WHERE variant_id IS NOT NULL) AS variant_inventory_rows,
      (SELECT COUNT(*)::int FROM product_attributes) AS attribute_rows,
      (SELECT COUNT(*)::int FROM product_images WHERE image_kind = 'gallery') AS gallery_images,
      (SELECT COUNT(*)::int FROM product_images WHERE image_kind = 'spec') AS spec_images
  `);
  console.log(counts.rows[0]);

  // Spot-check: 9' Auto Tilt should have 6 finishes + features/options/parts + 2 images
  const autoTilt = await db
    .select({
      sku: productsTable.sku,
      name: productsTable.name,
      variantCount: sql<number>`(SELECT COUNT(*)::int FROM product_variants WHERE product_id = ${productsTable.id})`,
      fabricCount: sql<number>`(SELECT COUNT(*)::int FROM product_fabric_options WHERE product_id = ${productsTable.id})`,
      featureCount: sql<number>`(SELECT COUNT(*)::int FROM product_attributes WHERE product_id = ${productsTable.id} AND attribute_type = 'feature')`,
      optionCount: sql<number>`(SELECT COUNT(*)::int FROM product_attributes WHERE product_id = ${productsTable.id} AND attribute_type = 'option')`,
      partCount: sql<number>`(SELECT COUNT(*)::int FROM product_attributes WHERE product_id = ${productsTable.id} AND attribute_type = 'replacement_part')`,
      galleryImages: sql<number>`(SELECT COUNT(*)::int FROM product_images WHERE product_id = ${productsTable.id} AND image_kind = 'gallery')`,
      specImages: sql<number>`(SELECT COUNT(*)::int FROM product_images WHERE product_id = ${productsTable.id} AND image_kind = 'spec')`,
    })
    .from(productsTable)
    .where(eq(productsTable.sku, "UM810"))
    .limit(1);
  console.log("9' Auto Tilt (UM810):", autoTilt[0]);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Loader failed:", err);
  process.exit(1);
});
