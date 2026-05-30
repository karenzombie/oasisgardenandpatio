import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { finishesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/frankford";
const IMG_DIR = join(
  import.meta.dirname,
  "../../frankford_images/frankford_finishes",
);
const MANUFACTURER_ID = 28;

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
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(join(IMG_DIR, filename));
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const ct = ext === "png" ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

function parseFilename(filename: string): { itemNumber: string; name: string } {
  // Pattern: {CODE}-{Name-With-Hyphens}.jpg
  // e.g. BK-Onyx.jpg → { itemNumber: "BK", name: "Onyx" }
  // e.g. BZ-Desert-Bronze.jpg → { itemNumber: "BZ", name: "Desert Bronze" }
  const stem = filename.replace(/\.[^.]+$/, "");
  const dashIdx = stem.indexOf("-");
  if (dashIdx === -1) return { itemNumber: stem, name: stem };
  const itemNumber = stem.slice(0, dashIdx);
  const name = stem.slice(dashIdx + 1).replace(/-/g, " ");
  return { itemNumber, name };
}

async function main() {
  const files = await readdir(IMG_DIR);
  const imageFiles = files.filter((f) =>
    ["jpg", "jpeg", "png"].includes(f.split(".").pop()?.toLowerCase() ?? ""),
  );

  console.log(`Found ${imageFiles.length} finish images in ${IMG_DIR}`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const filename of imageFiles.sort()) {
    const { itemNumber, name } = parseFilename(filename);
    console.log(`  Processing: ${filename} → item=${itemNumber}, name="${name}"`);

    try {
      const url = await uploadImage(filename);

      const existing = await db
        .select({ id: finishesTable.id })
        .from(finishesTable)
        .where(
          and(
            eq(finishesTable.manufacturerId, MANUFACTURER_ID),
            eq(finishesTable.itemNumber, itemNumber),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(finishesTable)
          .set({ name, imageUrl: url, isActive: true })
          .where(eq(finishesTable.id, existing[0].id));
        updated++;
        console.log(`    ✓ Updated (id=${existing[0].id})`);
      } else {
        const [row] = await db
          .insert(finishesTable)
          .values({
            manufacturerId: MANUFACTURER_ID,
            itemNumber,
            name,
            imageUrl: url,
            isActive: true,
            displayOrder: inserted,
          })
          .returning({ id: finishesTable.id });
        inserted++;
        console.log(`    ✓ Inserted (id=${row.id}) → ${url}`);
      }
    } catch (err) {
      errors++;
      console.error(`    ✗ ERROR for ${filename}:`, err);
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated} errors=${errors}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
