import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford";
const IMG_DIR = join(
  import.meta.dirname,
  "../../frankford_images/frankford_products",
);

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

async function upload(filename: string, storageFilename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageFilename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(join(IMG_DIR, filename));
  const ct = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageFilename}`;
}

const TASKS = [
  {
    productId: 2294,
    name: "Monterey Fiberglass Market (Pulley Lift)",
    file: "monterey-fiberglass-pulley-lift.jpg",
  },
  {
    productId: 2295,
    name: "Monterey Fiberglass Market (Crank Lift / No Tilt)",
    file: "monterey-fiberglass-crank-no-tilt.jpg",
  },
  {
    productId: 2296,
    name: "Monterey Fiberglass Market (Crank Lift / Auto Tilt)",
    file: "monterey-fiberglass-crank-auto-tilt.jpg",
  },
];

async function main() {
  for (const t of TASKS) {
    console.log(`Uploading: ${t.file}…`);
    const url = await upload(t.file, t.file);
    await db
      .insert(productImagesTable)
      .values({
        productId: t.productId,
        variantId: null,
        url,
        altText: t.name,
        displayOrder: 0,
        isPrimary: true,
      })
      .onConflictDoNothing();
    console.log(`  ✓ ${t.name} → ${url}`);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
