import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import { db, finishesTable, finishCollectionsTable, manufacturersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

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

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  subdir: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${subdir}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${subdir}/${filename}`;
}

const MANUFACTURER_NAME = "Homecrest";
const COLLECTION_NAME = "Polyethylene";
const IMAGE_DIR = "/home/runner/workspace/Homecrest_polyethylene_images";

interface FinishDef {
  filename: string;
  name: string;
  description: string;
  itemNumber: string | null;
}

function parseFilename(filename: string): FinishDef {
  const base = filename.replace(/\.jpg$/i, "");
  // e.g. Homecrest-Website-InPoolColorImages-DesertSandstone
  // e.g. Homecrest-Website-InPool-SeatPad-HeadPillow-ColorImages-AnthraciteGrey
  // e.g. Homecrest-Website-ProductColorImages-WhiteGranite
  const parts = base.split("-");
  const colorName = parts[parts.length - 1];

  // Clean up camelCase color names
  const cleanName = colorName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");

  if (base.includes("SeatPad-HeadPillow")) {
    return {
      filename,
      name: cleanName,
      description: "Seat pad & head pillow polyethylene finish",
      itemNumber: null,
    };
  }
  if (base.includes("InPoolColorImages")) {
    return {
      filename,
      name: cleanName,
      description: "In-pool polyethylene body finish",
      itemNumber: null,
    };
  }
  // ProductColorImages
  return {
    filename,
    name: cleanName,
    description: "Polyethylene body finish",
    itemNumber: null,
  };
}

async function main() {
  const files = (await readdir(IMAGE_DIR)).filter((f) =>
    f.toLowerCase().endsWith(".jpg"),
  );

  console.log(`Found ${files.length} polyethylene images in ${IMAGE_DIR}`);

  // Ensure Homecrest manufacturer exists
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(sql`LOWER(${manufacturersTable.name})`, MANUFACTURER_NAME.toLowerCase()));

  if (!mfg) {
    console.error(`Manufacturer '${MANUFACTURER_NAME}' not found`);
    process.exit(1);
  }
  console.log(`Homecrest manufacturer_id = ${mfg.id}`);

  // Ensure Polyethylene finish collection exists
  const [existingCollection] = await db
    .select({ id: finishCollectionsTable.id })
    .from(finishCollectionsTable)
    .where(
      eq(finishCollectionsTable.collectionName, COLLECTION_NAME),
    );

  let collectionId: number | undefined;
  if (existingCollection) {
    collectionId = existingCollection.id;
    console.log(`Using existing finish collection '${COLLECTION_NAME}' (id=${collectionId})`);
  } else {
    const [newCollection] = await db
      .insert(finishCollectionsTable)
      .values({
        manufacturerId: mfg.id,
        collectionName: COLLECTION_NAME,
        panelImageUrl: null,
        displayOrder: 0,
        isActive: true,
      })
      .returning({ id: finishCollectionsTable.id });
    collectionId = newCollection.id;
    console.log(`Created finish collection '${COLLECTION_NAME}' (id=${collectionId})`);
  }

  const defs = files.map(parseFilename);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const results: Array<{ id: number; name: string; collection: string; imageUrl: string; description: string }> = [];

  for (const def of defs) {
    try {
      // Check for existing finish with same name/description
      const [existing] = await db
        .select({ id: finishesTable.id })
        .from(finishesTable)
        .where(
          and(
            eq(finishesTable.manufacturerId, mfg.id),
            eq(finishesTable.name, def.name),
            eq(finishesTable.description, def.description),
          ),
        );

      if (existing) {
        console.log(`  SKIP: ${def.name} (${def.description}) already exists (id=${existing.id})`);
        skipped++;
        continue;
      }

      const buffer = await readFile(path.join(IMAGE_DIR, def.filename));
      const safeFilename = def.filename.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      const storagePath = await uploadBuffer(
        buffer,
        "image/jpeg",
        `finishes/homecrest/polyethylene`,
        safeFilename,
      );

      const [row] = await db
        .insert(finishesTable)
        .values({
          manufacturerId: mfg.id,
          name: def.name,
          itemNumber: def.itemNumber,
          imageUrl: storagePath,
          description: def.description,
          collection: COLLECTION_NAME,
          isActive: true,
          displayOrder: 0,
        })
        .returning({ id: finishesTable.id });

      created++;
      results.push({
        id: row.id,
        name: def.name,
        collection: COLLECTION_NAME,
        imageUrl: storagePath,
        description: def.description,
      });
      console.log(`  CREATED: id=${row.id} name="${def.name}" desc="${def.description}"`);
    } catch (err) {
      console.error(`  ERROR processing ${def.filename}:`, err);
      errors++;
    }
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped, ${errors} errors.`);
  console.log("\n=== FINISH IDs FOR PRODUCT WIRING ===");
  console.log(`Collection: "${COLLECTION_NAME}"`);
  for (const r of results.sort((a, b) => a.id - b.id)) {
    console.log(`  ${r.id}: ${r.name} (${r.description}) → ${r.imageUrl}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
