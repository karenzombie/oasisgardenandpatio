/**
 * Creates Homecrest frame finishes from the CSV.
 * Finish images are downloaded from the Homecrest website (no local copies).
 * Finishes are manufacturer-level reference data — NOT linked to individual
 * products via product_finish_options.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedHomecrestFinishes.ts
 */
import { readFileSync } from "node:fs";
import * as https from "node:https";
import * as http from "node:http";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable, finishesTable } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const FINISHES_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/homecrest_finishes_1780295519794.csv",
);
const MANUFACTURER_NAME = "Homecrest";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/homecrest";

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

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

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

type FinishRow = {
  "Finish Name": string;
  "Finish Image URL": string;
};

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  const raw = readFileSync(FINISHES_CSV, "utf8");
  const parsed = Papa.parse<FinishRow>(raw, { header: true, skipEmptyLines: true });

  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = row["Finish Name"]?.trim();
    const imageWebUrl = row["Finish Image URL"]?.trim();
    if (!name) continue;

    // Derive item_number from name slug for stable idempotency key
    const itemNumber = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${itemNumber}.jpg`;

    let imageUrl: string | null = null;
    if (imageWebUrl) {
      try {
        const buf = await fetchBuffer(imageWebUrl);
        imageUrl = await uploadBuffer(buf, filename);
        console.log(`  Downloaded & uploaded: ${name} → ${filename}`);
      } catch (err) {
        console.warn(`  WARN: could not fetch image for ${name}: ${err}`);
      }
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
        .set({ name, imageUrl, isActive: true })
        .where(eq(finishesTable.id, existing[0].id));
      updated++;
      console.log(`  Updated: ${name}`);
    } else {
      await db.insert(finishesTable).values({
        manufacturerId: mfg.id,
        itemNumber,
        name,
        imageUrl,
        description: "Frame finish",
        isActive: true,
        displayOrder: i,
      });
      inserted++;
      console.log(`  Inserted: ${name}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
