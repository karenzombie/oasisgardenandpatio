/**
 * Seeds Sunset West frame/material finishes from the product CSV.
 * Finish swatch images are loaded from local sunset_west_finishes/ directory.
 * Finishes are manufacturer-level reference data — NOT linked to individual
 * products via product_finish_options.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedSunsetWestFinishes.ts
 */
import { readFileSync } from "node:fs";
import { readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable, finishesTable } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const PRODUCTS_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/Sunset_West_2026_Product_Listing_1780345346210.csv",
);
const MANUFACTURER_NAME = "Sunset West";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/sunset-west";
const LOCAL_FINISH_BASE = join(WORKSPACE_ROOT, "sunset_west_finishes");

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

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function uploadBuffer(
  buffer: Buffer,
  storageName: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucket = storage.bucket(parts[0]);
  const file = bucket.file(parts.slice(1).join("/"));
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageName}`;
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ProductRow = {
  "Finish/Frame Finish": string;
  "Finish Image Filename": string;
  "Finish Image Available": string;
};

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found — run the products seed first to create it`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  const raw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsed = Papa.parse<ProductRow>(raw, { header: true, skipEmptyLines: true });

  // Build unique map: finishName → { imageFilename, imageAvailable }
  const finishMap = new Map<string, { imageFilename: string; imageAvailable: boolean }>();
  for (const row of parsed.data) {
    const name = row["Finish/Frame Finish"]?.trim();
    if (!name) continue;
    if (!finishMap.has(name)) {
      finishMap.set(name, {
        imageFilename: row["Finish Image Filename"]?.trim() ?? "",
        imageAvailable: (row["Finish Image Available"]?.trim() ?? "").toLowerCase() === "yes",
      });
    }
  }

  console.log(`Found ${finishMap.size} unique finishes in CSV`);

  let inserted = 0;
  let updated = 0;
  let i = 0;

  for (const [name, { imageFilename, imageAvailable }] of finishMap) {
    const itemNumber = toSlug(name);
    const storageFilename = `${itemNumber}${imageFilename.endsWith(".png") ? ".png" : ".jpg"}`;
    const contentType = storageFilename.endsWith(".png") ? "image/png" : "image/jpeg";

    let imageUrl: string | null = null;

    if (imageAvailable && imageFilename) {
      const localPath = join(LOCAL_FINISH_BASE, imageFilename);
      try {
        if (await fileExists(localPath)) {
          const buf = await readFile(localPath);
          imageUrl = await uploadBuffer(buf, storageFilename, contentType);
          console.log(`  Uploaded: ${name} → ${storageFilename}`);
        } else {
          console.warn(`  WARN: local file not found: ${localPath}`);
        }
      } catch (err) {
        console.warn(`  WARN: could not upload image for ${name}: ${err}`);
      }
    }

    const [existing] = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, mfg.id),
          eq(finishesTable.itemNumber, itemNumber),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(finishesTable)
        .set({ name, imageUrl: imageUrl ?? undefined, isActive: true })
        .where(eq(finishesTable.id, existing.id));
      updated++;
      console.log(`  Updated: ${name}`);
    } else {
      await db.insert(finishesTable).values({
        manufacturerId: mfg.id,
        itemNumber,
        name,
        imageUrl,
        description: "Frame/material finish",
        isActive: true,
        displayOrder: i,
      });
      inserted++;
      console.log(`  Inserted: ${name}`);
    }

    i++;
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
