import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import { and, eq } from "drizzle-orm";
import { db, fabricsTable, manufacturersTable } from "@workspace/db";

const LOCAL_IMAGE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../attached_assets/Vacation_Aqua_RV20_1785428797148.png",
);
const STORAGE_FILENAME = "rv20-vacation-aqua.png";
const STORAGE_PATH = `/objects/fabrics/owlee/${STORAGE_FILENAME}`;
const MANUFACTURER_SLUG = "o-w-lee";
const ITEM_NUMBER = "RV20";
const EXPECTED_FABRIC_ID = 99;

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

function parsePrivateDir(): { bucketName: string; prefix: string } {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  const trimmed = privateDir.replace(/^\/+|\/+$/g, "");
  const slash = trimmed.indexOf("/");
  return slash === -1
    ? { bucketName: trimmed, prefix: "" }
    : { bucketName: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function main() {
  const [manufacturer] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.slug, MANUFACTURER_SLUG))
    .limit(1);
  if (!manufacturer) throw new Error(`Manufacturer "${MANUFACTURER_SLUG}" not found`);

  const [fabric] = await db
    .select({
      id: fabricsTable.id,
      itemNumber: fabricsTable.itemNumber,
      name: fabricsTable.name,
      grade: fabricsTable.grade,
      swatchImageUrl: fabricsTable.swatchImageUrl,
    })
    .from(fabricsTable)
    .where(
      and(
        eq(fabricsTable.id, EXPECTED_FABRIC_ID),
        eq(fabricsTable.manufacturerId, manufacturer.id),
        eq(fabricsTable.itemNumber, ITEM_NUMBER),
      ),
    )
    .limit(1);
  if (!fabric) {
    throw new Error(
      `Expected O.W. Lee fabric id=${EXPECTED_FABRIC_ID}, item=${ITEM_NUMBER} was not found`,
    );
  }

  const { bucketName, prefix } = parsePrivateDir();
  const objectName = prefix
    ? `${prefix}/fabrics/owlee/${STORAGE_FILENAME}`
    : `fabrics/owlee/${STORAGE_FILENAME}`;
  const buffer = await readFile(LOCAL_IMAGE);
  await storage.bucket(bucketName).file(objectName).save(buffer, {
    contentType: "image/png",
    resumable: false,
  });

  await db
    .update(fabricsTable)
    .set({
      swatchImageUrl: STORAGE_PATH,
      grade: "C",
    })
    .where(eq(fabricsTable.id, fabric.id));

  const [updated] = await db
    .select({
      id: fabricsTable.id,
      itemNumber: fabricsTable.itemNumber,
      name: fabricsTable.name,
      grade: fabricsTable.grade,
      swatchImageUrl: fabricsTable.swatchImageUrl,
    })
    .from(fabricsTable)
    .where(eq(fabricsTable.id, fabric.id))
    .limit(1);

  console.log("Updated O.W. Lee fabric:");
  console.log(updated);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});