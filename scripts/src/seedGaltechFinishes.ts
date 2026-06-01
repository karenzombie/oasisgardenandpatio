import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable, finishesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/galtech";
const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const IMG_DIR = join(WORKSPACE_ROOT, "galtech_images/finishes");
const MANUFACTURER_NAME = "Galtech International";

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

function filenameToName(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  // Ensure manufacturer exists
  let [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);

  if (!mfg) {
    const [ins] = await db
      .insert(manufacturersTable)
      .values({
        name: MANUFACTURER_NAME,
        slug: "galtech-international",
        isActive: true,
      })
      .returning({ id: manufacturersTable.id });
    mfg = ins;
    console.log(`Created manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  } else {
    console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  }

  const files = await readdir(IMG_DIR);
  const imageFiles = files.filter((f) =>
    ["jpg", "jpeg", "png"].includes(f.split(".").pop()?.toLowerCase() ?? ""),
  );
  console.log(`Found ${imageFiles.length} finish images`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const filename of imageFiles.sort()) {
    const name = filenameToName(filename);
    console.log(`  Processing: ${filename} → "${name}"`);

    try {
      const url = await uploadImage(filename);

      const existing = await db
        .select({ id: finishesTable.id })
        .from(finishesTable)
        .where(
          and(
            eq(finishesTable.manufacturerId, mfg.id),
            eq(finishesTable.name, name),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(finishesTable)
          .set({ imageUrl: url, isActive: true })
          .where(eq(finishesTable.id, existing[0].id));
        updated++;
        console.log(`    ✓ Updated (id=${existing[0].id})`);
      } else {
        const [row] = await db
          .insert(finishesTable)
          .values({
            manufacturerId: mfg.id,
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

  // Also create any finishes that have no image (e.g. "Standard Bronze")
  const noImageFinishes = ["Standard Bronze"];
  for (const name of noImageFinishes) {
    const existing = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, mfg.id),
          eq(finishesTable.name, name),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      const [row] = await db
        .insert(finishesTable)
        .values({
          manufacturerId: mfg.id,
          name,
          isActive: true,
          displayOrder: inserted + noImageFinishes.indexOf(name),
        })
        .returning({ id: finishesTable.id });
      console.log(`  Created no-image finish "${name}" (id=${row.id})`);
      inserted++;
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
