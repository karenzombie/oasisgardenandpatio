/**
 * Creates Telescope Casual frame finishes (Powdercoat + MGP) from the CSV.
 * Finishes are manufacturer-level reference data — NOT linked to individual
 * products via product_finish_options.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedTelescopeFinishes.ts
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable, finishesTable } from "@workspace/db";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/telescope";
const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const IMG_DIR = join(WORKSPACE_ROOT, "telescope_images/finishes");
const FINISHES_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/telescope_frame_finishes_1780290802221.csv",
);
const MANUFACTURER_NAME = "Telescope Casual";

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

async function uploadImage(filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucket = storage.bucket(parts[0]);
  const file = bucket.file(parts.slice(1).join("/"));
  const buffer = await readFile(join(IMG_DIR, filename));
  const ct = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

type FinishRow = {
  finish_type: string;
  finish_code: string;
  finish_name: string;
  finish_slug: string;
  applies_to: string;
  swatch_image_path: string;
  swatch_image_url: string;
};

async function main() {
  // Resolve manufacturer
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  // Pre-upload the two swatch overview images (deduped by filename)
  const uploadedSwatches = new Map<string, string>();
  for (const filename of ["powdercoat_overview.jpg", "mgp_overview.jpg"]) {
    try {
      const url = await uploadImage(filename);
      uploadedSwatches.set(filename, url);
      console.log(`  Uploaded swatch: ${filename}`);
    } catch (err) {
      console.error(`  ERROR uploading ${filename}:`, err);
    }
  }

  const raw = readFileSync(FINISHES_CSV, "utf8");
  const parsed = Papa.parse<FinishRow>(raw, { header: true, skipEmptyLines: true });

  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = row.finish_name?.trim();
    const itemNumber = row.finish_code?.trim();
    const frameType = row.finish_type?.trim(); // "Powdercoat" or "MGP"
    if (!name || !frameType) continue;

    // swatch_image_path = "images/finishes/powdercoat_overview.jpg"
    const swatchFile = row.swatch_image_path?.split("/").pop() ?? "";
    const imageUrl = uploadedSwatches.get(swatchFile) ?? null;

    const description = `${frameType} frame finish`;

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
        .set({ name, imageUrl, description, isActive: true })
        .where(eq(finishesTable.id, existing[0].id));
      updated++;
      console.log(`  Updated: ${frameType} - ${name} (${itemNumber})`);
    } else {
      await db.insert(finishesTable).values({
        manufacturerId: mfg.id,
        itemNumber,
        name,
        imageUrl,
        description,
        isActive: true,
        displayOrder: i,
      });
      inserted++;
      console.log(`  Inserted: ${frameType} - ${name} (${itemNumber})`);
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
