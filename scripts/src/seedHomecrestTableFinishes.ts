/**
 * Adds 11 Homecrest "Table Finishes" to the finishes table,
 * creates a "Table Finishes" finish collection, and uploads
 * swatch images from attached_assets/ to Object Storage.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedHomecrestTableFinishes.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { eq, and } from "drizzle-orm";
import {
  db,
  manufacturersTable,
  finishesTable,
  finishCollectionsTable,
} from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const MANUFACTURER_NAME = "Homecrest";
const COLLECTION_NAME = "Table Finishes";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/homecrest";

const FINISHES: Array<{ fileName: string; name: string; itemNumber: string }> = [
  { fileName: "Drift-21_1783464050162.jpg", name: "Drift", itemNumber: "drift" },
  { fileName: "Frost-75_1783464050162.jpg", name: "Frost", itemNumber: "frost" },
  { fileName: "Coastal_Gray-23_1783464050162.jpg", name: "Coastal Gray", itemNumber: "coastal-gray" },
  { fileName: "Sequoia-20_1783464050162.jpg", name: "Sequoia", itemNumber: "sequoia" },
  { fileName: "Weathered_Wood-25_1783464050162.jpg", name: "Weathered Wood", itemNumber: "weathered-wood" },
  { fileName: "Dune-73_1783464050162.jpg", name: "Dune", itemNumber: "dune" },
  { fileName: "Boulder-74_1783464050162.jpg", name: "Boulder", itemNumber: "boulder" },
  { fileName: "Char-70_1783464050162.jpg", name: "Char", itemNumber: "char" },
  { fileName: "Midnight-72_1783464050162.jpg", name: "Midnight", itemNumber: "midnight" },
  { fileName: "Light_Gray-32_1783464050162.jpg", name: "Light Gray", itemNumber: "light-gray" },
  { fileName: "Brazilian_Walnut-24_1783464050162.jpg", name: "Brazilian Walnut", itemNumber: "brazilian-walnut" },
];

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

async function uploadBuffer(buffer: Buffer, storageName: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucket = storage.bucket(parts[0]);
  const file = bucket.file(parts.slice(1).join("/"));
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageName}`;
}

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  // 1. Create the "Table Finishes" collection if it doesn't exist
  const existingCollections = await db
    .select({ id: finishCollectionsTable.id })
    .from(finishCollectionsTable)
    .where(
      and(
        eq(finishCollectionsTable.manufacturerId, mfg.id),
        eq(finishCollectionsTable.collectionName, COLLECTION_NAME),
      ),
    )
    .limit(1);

  if (existingCollections.length === 0) {
    await db.insert(finishCollectionsTable).values({
      manufacturerId: mfg.id,
      collectionName: COLLECTION_NAME,
      panelImageUrl: null,
      displayOrder: 0,
      isActive: true,
    });
    console.log(`Created finish collection: "${COLLECTION_NAME}"`);
  } else {
    console.log(`Collection "${COLLECTION_NAME}" already exists`);
  }

  // 2. Upload images and insert/update finishes
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < FINISHES.length; i++) {
    const { fileName, name, itemNumber } = FINISHES[i];
    const filePath = resolve(WORKSPACE_ROOT, "attached_assets", fileName);

    let imageUrl: string | null = null;
    try {
      const buf = readFileSync(filePath);
      imageUrl = await uploadBuffer(buf, `${itemNumber}.jpg`);
      console.log(`  Uploaded ${name} → ${imageUrl}`);
    } catch (err) {
      console.warn(`  WARN: could not upload image for ${name}: ${err}`);
      failed++;
      continue;
    }

    const existing = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, mfg.id),
          eq(finishesTable.itemNumber, itemNumber),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(finishesTable)
        .set({
          name,
          imageUrl,
          collection: COLLECTION_NAME,
          isActive: true,
        })
        .where(eq(finishesTable.id, existing[0].id));
      updated++;
      console.log(`  Updated: ${name}`);
    } else {
      await db.insert(finishesTable).values({
        manufacturerId: mfg.id,
        itemNumber,
        name,
        imageUrl,
        description: "Table finish",
        collection: COLLECTION_NAME,
        isActive: true,
        displayOrder: i,
      });
      inserted++;
      console.log(`  Inserted: ${name}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
