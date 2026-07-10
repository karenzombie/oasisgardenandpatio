/**
 * Add the "Woven Finishes" section to Homecrest finishes.
 *
 * - Uploads each unique woven-finish swatch image once to Object Storage.
 * - Inserts a `finishes` row per swatch (collection="Woven Finishes", the
 *   woven pattern name stored in `description` so the finishes page can
 *   show it above the color name, e.g. "ROWAN" / "Fog Greige").
 * - Idempotent: skips any (manufacturer, name, description) combo that
 *   already exists.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestWovenFinishes.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { and, eq } from "drizzle-orm";
import { db, finishesTable, manufacturersTable } from "@workspace/db";

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

async function uploadFile(localPath: string, storageName: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${storageName}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const buffer = await readFile(localPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/uploads/${storageName}`;
}

// Splits a PascalCase finish name into words, e.g. "FogGreige" -> "Fog Greige".
function splitPascalCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// Source image files: "<Collection>-<FinishNamePascalCase>_<timestamp>.jpg".
// Only one copy of each unique swatch is needed (attachments arrived twice
// under two different timestamps with identical content).
const SOURCE_FILES = [
  "Rowan-FogGreige_1783713875508.jpg",
  "Rowan-NightfallGraphite_1783713875508.jpg",
  "Capri-FogShell_1783713875508.jpg",
  "Capri-NightfallSafari_1783713875508.jpg",
  "Casper-NightfallGraphite_1783713875508.jpg",
  "Casper-NightfallGreige_1783713875508.jpg",
];

const COLLECTION_LABEL = "Woven Finishes";

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const assetsDir = path.resolve(__dirname, "../../attached_assets");

  const [homecrest] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, "Homecrest"));
  if (!homecrest) throw new Error("Homecrest manufacturer not found");

  const entries = SOURCE_FILES.map((fileName) => {
    const base = fileName.replace(/_\d+\.jpg$/, "");
    const [collection, rawName] = base.split("-");
    const name = splitPascalCase(rawName);
    return { fileName, collection, name };
  });

  let uploaded = 0;
  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const localFile = path.join(assetsDir, entry.fileName);
    const storageName = `homecrest-woven-${entry.collection.toLowerCase()}-${entry.name
      .toLowerCase()
      .replace(/\s+/g, "-")}.jpg`;

    const [existing] = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, homecrest.id),
          eq(finishesTable.name, entry.name),
          eq(finishesTable.description, entry.collection),
        ),
      );
    if (existing) {
      console.log(`  SKIP (exists): ${entry.collection} / ${entry.name}`);
      skipped++;
      continue;
    }

    const storagePath = await uploadFile(localFile, storageName);
    uploaded++;
    console.log(`  ✓ uploaded ${entry.fileName} → ${storagePath}`);

    await db.insert(finishesTable).values({
      manufacturerId: homecrest.id,
      name: entry.name,
      imageUrl: storagePath,
      description: entry.collection,
      collection: COLLECTION_LABEL,
      isActive: true,
      displayOrder: 0,
    });
    inserted++;
    console.log(`  ✓ inserted finish: ${entry.collection} / ${entry.name}`);
  }

  console.log(`\nDone. uploaded=${uploaded} inserted=${inserted} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
