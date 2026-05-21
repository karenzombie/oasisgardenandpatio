import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadImage(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/owlee/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/owlee/${filename}`;
}

// ---------------------------------------------------------------------------
// Assignment map: product_id → { primary, secondaryImages }
// Priority: specific > piece-type > collection
// ---------------------------------------------------------------------------

// Priority 1 – exact/specific product images
const specific: Array<{ filename: string; productIds: number[] }> = [
  { filename: "ARC CENTER SECTIONAL.jpg",               productIds: [2087] },
  { filename: "ARC CORNER SECTIONAL.jpg",               productIds: [2088] },
  { filename: "ARC LEFT SECTIONAL.jpg",                 productIds: [2089] },
  { filename: "ARC LOUNGE CHAIR.jpg",                   productIds: [2082] },
  { filename: "ARC LOVE SEAT.jpg",                      productIds: [2084] },
  { filename: "ARC RIGHT SECTIONAL.jpg",                productIds: [2086] },
  { filename: "ARC SOFA.jpg",                           productIds: [2085] },
  { filename: "ARC SWIVEL ROCKER LOUNGE CHAIR.jpg",     productIds: [2083] },
  { filename: "MONTERRA CENTER SECTIONAL.jpg",          productIds: [2030] },
  { filename: "MONTERRA CRESCENT LOVE SEAT.jpg",        productIds: [2027] },
  { filename: "MONTERRA CURVED OTTOMAN.jpg",            productIds: [2043] },
  { filename: "MONTERRA LEFT SECTIONAL.jpg",            productIds: [2029] },
  { filename: "MONTERRA LOVE SEAT.jpg",                 productIds: [2026] },
  { filename: "MONTERRA OTTOMAN.jpg",                   productIds: [2032] },
  { filename: "MONTERRA RIGHT SECTIONAL.jpg",           productIds: [2031] },
  { filename: "MONTERRA SOFA.jpg",                      productIds: [2028] },
  { filename: "MONTERRA SPRING BASE LOUNGE CHAIR.jpg",  productIds: [2024] },
  { filename: "MONTERRA SWIVEL ROCKER LOUNGE CHAIR.jpg",productIds: [2025] },
  { filename: "MONTERRA URBAN SCALE SOFA.jpg",          productIds: [2037] },
  { filename: "SLING ADJUSTABLE CHAISE LOUNGE.jpg",     productIds: [2091] },
  { filename: "URBAN-SCALE CRESCENT LOVE SEAT.jpg",     productIds: [2035] },
  { filename: "URBAN SCALE LOVE SEAT.jpg",              productIds: [2036] },
  { filename: "URBAN SCALE OTTOMAN.jpg",                productIds: [2038] },
  { filename: "URBAN-SCALE SPRING BASE LOUNGE CHAIR.jpg",productIds: [2033] },
  { filename: "URBAN-SCALE SWIVEL ROCKER LOUNGE CHAIR.jpg",productIds: [2034] },
];

// Priority 2 – generic piece-type images (apply only to products not already covered)
const pieceType: Array<{ filename: string; productIds: number[] }> = [
  { filename: "BAR STOOL.jpg",                    productIds: [2096, 2081, 2080, 2060] },
  { filename: "COUNTER STOOL.jpg",                productIds: [2095, 2079, 2078, 2054] },
  { filename: "DINING ARM CHAIR.jpg",             productIds: [2093, 2076, 2056, 2039] },
  { filename: "DINING SWIVEL ROCKER ARM CHAIR.jpg",productIds: [2058, 2040] },
  { filename: "OTTOMAN.jpg",                      productIds: [2090, 2073, 2052] },
  { filename: "SWIVEL BAR STOOL WITH ARMS.jpg",   productIds: [2061, 2042] },
  { filename: "SWIVEL COUNTER STOOL WITH ARMS.jpg",productIds: [2059, 2041] },
  { filename: "SWIVEL ROCKER DINING ARM CHAIR.jpg",productIds: [2094, 2077, 2057] },
];

// Priority 3 – collection-level images (apply only to products not yet covered)
const collection: Array<{ filename: string; productIds: number[] }> = [
  // All Aris products
  {
    filename: "ARIS.jpg",
    productIds: [2074,2081,2079,2080,2078,2076,2075,2066,2069,2070,2072,2068,2073,2071,2077,2067],
  },
  // All Monterra products
  {
    filename: "MONTERRA.jpg",
    productIds: [2044,2030,2027,2043,2039,2040,2029,2023,2026,2032,2031,2028,2024,2042,2041,2025,2036,2038,2037,2035,2033,2034],
  },
  // Classico (W = wrought iron line)
  {
    filename: "CLASSICO-W.jpg",
    productIds: [2053,2060,2054,2058,2064,2056,2179,2055,2048,2049,2045,2050,2052,2051,2047,2061,2059,2057,2046,2062,2063,2065],
  },
  // Table Bases Marin
  {
    filename: "MARIN.jpg",
    productIds: [2151,2152,2153,2154],
  },
];

// ---------------------------------------------------------------------------
// Build final assignment: product_id → { primary filename, secondaries[] }
// ---------------------------------------------------------------------------
type Assignment = { primary: string; secondary: string[] };
const assignments = new Map<number, Assignment>();

function assignImage(filename: string, productIds: number[], asPrimary: boolean) {
  for (const pid of productIds) {
    const existing = assignments.get(pid);
    if (!existing) {
      assignments.set(pid, { primary: filename, secondary: [] });
    } else if (asPrimary) {
      // More-specific image takes over as primary; existing becomes secondary
      existing.secondary.unshift(existing.primary);
      existing.primary = filename;
    } else {
      // Already has a more-specific primary; add this as secondary
      if (!existing.secondary.includes(filename)) {
        existing.secondary.push(filename);
      }
    }
  }
}

// Apply in order: specific first, then piece-type, then collection
for (const entry of specific) assignImage(entry.filename, entry.productIds, true);
for (const entry of pieceType) assignImage(entry.filename, entry.productIds, false);
// For collection images: also set as primary if no primary yet
for (const entry of collection) {
  for (const pid of entry.productIds) {
    const existing = assignments.get(pid);
    if (!existing) {
      assignments.set(pid, { primary: entry.filename, secondary: [] });
    } else {
      if (!existing.secondary.includes(entry.filename)) {
        existing.secondary.push(entry.filename);
      }
    }
  }
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../../owlee_images");

  // Collect unique filenames we need to upload
  const allFilenames = new Set<string>();
  for (const { primary, secondary } of assignments.values()) {
    allFilenames.add(primary);
    for (const s of secondary) allFilenames.add(s);
  }

  console.log(`Uploading ${allFilenames.size} unique image files…`);

  // Upload all images and cache storage paths
  const storagePaths = new Map<string, string>();
  let uploadCount = 0;
  const BATCH = 5;
  const filenames = [...allFilenames];

  for (let i = 0; i < filenames.length; i += BATCH) {
    const batch = filenames.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filename) => {
        try {
          const buffer = await readFile(path.join(imageDir, filename));
          const storagePath = await uploadImage(buffer, filename);
          storagePaths.set(filename, storagePath);
          uploadCount++;
        } catch (err) {
          console.error(`  ERROR uploading "${filename}":`, err);
        }
      }),
    );
    console.log(`  Uploaded ${Math.min(i + BATCH, filenames.length)}/${filenames.length}`);
  }

  console.log(`\nUpload complete: ${uploadCount}/${filenames.length} succeeded`);

  // Delete any existing product_images rows for these products (clean slate)
  const productIds = [...assignments.keys()];
  const deleted = await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds))
    .returning({ id: productImagesTable.id });
  console.log(`Removed ${deleted.length} existing image rows`);

  // Insert new rows
  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: string;
    altText: string | null;
  }> = [];

  for (const [productId, { primary, secondary }] of assignments.entries()) {
    const primaryPath = storagePaths.get(primary);
    if (!primaryPath) {
      console.warn(`  WARN: no uploaded path for primary "${primary}" on product ${productId}`);
      continue;
    }
    rows.push({
      productId,
      url: primaryPath,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
      altText: null,
    });
    secondary.forEach((filename, idx) => {
      const secPath = storagePaths.get(filename);
      if (secPath) {
        rows.push({
          productId,
          url: secPath,
          isPrimary: false,
          displayOrder: idx + 1,
          imageKind: "gallery",
          altText: null,
        });
      }
    });
  }

  // Batch insert
  const INSERT_BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    await db.insert(productImagesTable).values(batch);
    inserted += batch.length;
  }

  console.log(`\nInserted ${inserted} product_images rows for ${assignments.size} products`);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
