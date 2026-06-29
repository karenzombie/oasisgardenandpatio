import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { finishesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/frankford";
const IMG_DIR = join(import.meta.dirname, "../../attached_assets");
const MANUFACTURER_ID = 28;
const COLLECTION = "Base Plate Top Colors";

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

async function uploadImage(
  sourceFilename: string,
  destFilename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${destFilename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(join(IMG_DIR, sourceFilename));
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${destFilename}`;
}

const ITEM = {
  sourceFilename: "galvanized_base_plate_top_cover_assorted_1782757857405.jpg",
  destFilename: "BasePlate_Top_Colors_Assorted.jpg",
  name: "Base Plate Top Covers",
};

async function main() {
  console.log(`Uploading ${ITEM.sourceFilename}...`);
  const imageUrl = await uploadImage(ITEM.sourceFilename, ITEM.destFilename);
  console.log(`  → stored at ${imageUrl}`);

  const existing = await db
    .select({ id: finishesTable.id })
    .from(finishesTable)
    .where(
      and(
        eq(finishesTable.manufacturerId, MANUFACTURER_ID),
        eq(finishesTable.name, ITEM.name),
        eq(finishesTable.collection, COLLECTION),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(finishesTable)
      .set({ imageUrl, collection: COLLECTION, displayOrder: 0, isActive: true })
      .where(eq(finishesTable.id, existing[0].id));
    console.log(`  → updated existing finish id=${existing[0].id}`);
  } else {
    const [inserted] = await db
      .insert(finishesTable)
      .values({
        manufacturerId: MANUFACTURER_ID,
        name: ITEM.name,
        imageUrl,
        collection: COLLECTION,
        displayOrder: 0,
        isActive: true,
      })
      .returning({ id: finishesTable.id });
    console.log(`  → inserted finish id=${inserted.id}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
