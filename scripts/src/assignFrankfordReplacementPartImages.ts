import { readFile } from "node:fs/promises";
import { Storage } from "@google-cloud/storage";
import { db, productImagesTable, productsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford";
const ROOT = "/home/runner/workspace/attached_assets";

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

async function uploadSource(localFile: string, storageFilename: string): Promise<string> {
  const buffer = await readFile(`${ROOT}/${localFile}`);
  const ct = localFile.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return uploadBuffer(buffer, ct, storageFilename);
}

// ---------------------------------------------------------------------------
// Group 1: specific images (6 SKUs)
// ---------------------------------------------------------------------------
const GROUP1: { sku: string; localFile: string; storageFilename: string }[] = [
  { sku: "36G-SQx4", localFile: "36G-SQx4_1783045446521.png", storageFilename: "replacement-parts/36G-SQx4.png" },
  { sku: "38-SAP", localFile: "38SAP_38SAP2_1783045456761.png", storageFilename: "replacement-parts/38-SAP.png" },
  { sku: "38-SAP-2", localFile: "38SAP_38SAP2_1783045456761.png", storageFilename: "replacement-parts/38-SAP.png" },
  { sku: "BZ-SM", localFile: "BZ_BZ2-SM_1783045456761.png", storageFilename: "replacement-parts/BZ_BZ2-SM.png" },
  { sku: "FC101-NF", localFile: "FC101-NF_1783045456761.png", storageFilename: "replacement-parts/FC101-NF.png" },
  { sku: "IG", localFile: "IG_1783045456761.png", storageFilename: "replacement-parts/IG.png" },
];

// ---------------------------------------------------------------------------
// Group 2: bottom-pole image (7 SKUs)
// ---------------------------------------------------------------------------
const GROUP2_SKUS = ["37-BP", "38F-SR-BP", "42AP", "42F-SR-BP", "47-BP", "52F-SR-BP", "WL-B"];
const GROUP2_LOCAL_FILE = "bottom-pole-umbrella.jpg_1783045456761.png";
const GROUP2_STORAGE_FILENAME = "replacement-parts/bottom-pole-umbrella.png";

// ---------------------------------------------------------------------------
// Group 3: replacement-parts placeholder (58 SKUs; SS-DB handled separately)
// ---------------------------------------------------------------------------
const GROUP3_SKUS = [
  "01-B (4)", "02-B (4)", "03-B (4)", "04-B (4)", "1170", "1174", "480F", "480W",
  "50S/23-ST4", "50S/23-ST8", "75S/100S-ST8", "A-WHEEL", "ARU-RIB", "ARU-SP",
  "ARU-WS", "ARUF-RIB", "BZ-IG", "BZ-ST-SM", "BZ-ST2-SM", "C-SS-VERTEX FINIAL",
  "C-TPU VERTEX", "CAM-RIB", "CAM-RIB-G", "CANOPY-SS", "CB01", "CB01-FC",
  "CB87-B-SS (2)", "CHROME FINIALS", "CMLK-DP", "CMLK-ST-SM", "D-WHEEL (1)",
  "ECU-RIB", "ECU-SP", "ECU-WS", "ECU/ARU-PC", "FM-RIB", "FM-RIB-G", "GS/876-PC",
  "HBF", "LED-C1", "LED-C2", "LED-C3", "LED-C4", "LED01", "MCB01", "NGU-PC",
  "PC-LG", "PC-SM", "PIN & CHAIN", "ROPE", "SA-WHEEL (1)", "SBC",
  "SS-VERTEX FINIAL", "ST-B (3)", "ST-TS", "TPU/FINIALS", "W-SPRING",
];
const GROUP3_LOCAL_FILE = "replacement_parts_placeholder_1783045456761.png";
const GROUP3_STORAGE_FILENAME = "replacement-parts/replacement_parts_placeholder.png";

// ---------------------------------------------------------------------------
// SS-DB: task listed "SS-DB-4" and "SS-DB-4-Marella" (placeholder image), but
// neither SKU exists in the DB. Only "SS-DB (4)" exists (the un-remapped raw
// CSV SKU). The source CSV had two distinct rows sharing that same raw SKU
// ("SS-DB (4)" and "SS-DB (4) Marella") — the Marella row was apparently lost
// during import (duplicate-SKU insert collision) and no Marella product was
// ever created. We apply the placeholder to the one existing product and flag
// the missing Marella product as a data gap (out of scope to create here —
// see follow-up task).
// ---------------------------------------------------------------------------
const SS_DB_EXISTING_SKU = "SS-DB (4)";
const SS_DB_MISSING_SKUS = ["SS-DB-4", "SS-DB-4-Marella"];

const MANUFACTURER_ID = 28;

async function replaceImage(productId: number, url: string, altText: string) {
  await db.delete(productImagesTable).where(eq(productImagesTable.productId, productId));
  await db.insert(productImagesTable).values({
    productId,
    variantId: null,
    url,
    altText,
    displayOrder: 0,
    isPrimary: true,
    imageKind: "gallery",
  });
}

async function resolveSkuMap(skus: string[]): Promise<Map<string, { id: number; name: string }>> {
  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));
  const map = new Map<string, { id: number; name: string }>();
  for (const r of rows) map.set(r.sku, { id: r.id, name: r.name });
  return map;
}

async function main() {
  // Sanity: manufacturer scoping check
  const allSkus = [
    ...GROUP1.map((g) => g.sku),
    ...GROUP2_SKUS,
    ...GROUP3_SKUS,
  ];
  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, manufacturerId: productsTable.manufacturerId })
    .from(productsTable)
    .where(inArray(productsTable.sku, allSkus));
  const wrongMfr = rows.filter((r) => r.manufacturerId !== MANUFACTURER_ID);
  if (wrongMfr.length > 0) {
    console.error("ERROR: SKUs resolved outside manufacturer 28:", wrongMfr);
    process.exit(1);
  }
  const found = new Set(rows.map((r) => r.sku));
  const missing = allSkus.filter((s) => !found.has(s));
  if (missing.length > 0) {
    console.error("ERROR: SKUs failed to resolve:", missing);
    process.exit(1);
  }
  const map = new Map(rows.map((r) => [r.sku, r]));

  // --- Group 1 ---
  const uploadedUrls = new Map<string, string>();
  for (const g of GROUP1) {
    let url = uploadedUrls.get(g.storageFilename);
    if (!url) {
      url = await uploadSource(g.localFile, g.storageFilename);
      uploadedUrls.set(g.storageFilename, url);
      console.log(`Uploaded ${g.storageFilename} -> ${url}`);
    }
    const p = map.get(g.sku)!;
    await replaceImage(p.id, url, p.name);
    console.log(`  Group1: ${g.sku} (#${p.id} ${p.name}) -> ${url}`);
  }

  // --- Group 2 ---
  const group2Url = await uploadSource(GROUP2_LOCAL_FILE, GROUP2_STORAGE_FILENAME);
  console.log(`Uploaded ${GROUP2_STORAGE_FILENAME} -> ${group2Url}`);
  for (const sku of GROUP2_SKUS) {
    const p = map.get(sku)!;
    await replaceImage(p.id, group2Url, p.name);
    console.log(`  Group2: ${sku} (#${p.id} ${p.name}) -> ${group2Url}`);
  }

  // --- Group 3 ---
  const group3Url = await uploadSource(GROUP3_LOCAL_FILE, GROUP3_STORAGE_FILENAME);
  console.log(`Uploaded ${GROUP3_STORAGE_FILENAME} -> ${group3Url}`);
  for (const sku of GROUP3_SKUS) {
    const p = map.get(sku)!;
    await replaceImage(p.id, group3Url, p.name);
    console.log(`  Group3: ${sku} (#${p.id} ${p.name}) -> ${group3Url}`);
  }

  // --- SS-DB (existing product only; Marella variant does not exist — see note above) ---
  const ssDbRows = await db
    .select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, manufacturerId: productsTable.manufacturerId })
    .from(productsTable)
    .where(eq(productsTable.sku, SS_DB_EXISTING_SKU));
  if (ssDbRows.length === 0) {
    console.error(`ERROR: expected existing SS-DB product with sku "${SS_DB_EXISTING_SKU}" not found`);
    process.exit(1);
  }
  const ssDb = ssDbRows[0]!;
  if (ssDb.manufacturerId !== MANUFACTURER_ID) {
    console.error(`ERROR: SS-DB product resolved outside manufacturer 28:`, ssDb);
    process.exit(1);
  }
  await replaceImage(ssDb.id, group3Url, ssDb.name);
  console.log(`  SS-DB: ${SS_DB_EXISTING_SKU} (#${ssDb.id} ${ssDb.name}) -> ${group3Url}`);
  console.log(
    `NOTE: task-listed SKUs ${SS_DB_MISSING_SKUS.join(" / ")} do not exist in the DB; ` +
      `"${SS_DB_EXISTING_SKU}" is the only existing SS-DB product and was updated instead. ` +
      `The Marella variant appears to have been lost during a prior CSV import (duplicate-SKU collision) ` +
      `and was NOT created here (out of scope — flagged as a follow-up task).`,
  );

  console.log(`\nDone. Group1=${GROUP1.length} Group2=${GROUP2_SKUS.length} Group3=${GROUP3_SKUS.length} SS-DB=1`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
