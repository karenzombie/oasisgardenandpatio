import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const ASSETS_DIR = join(import.meta.dirname, "../../attached_assets");

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

async function uploadFile(
  localPath: string,
  storageName: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const buffer = await readFile(localPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/uploads/${storageName}`;
}

async function main() {
  const product = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, "UM8810RT"));
  if (product.length === 0) throw new Error("UM8810RT not found");
  const pid = product[0].id;

  // 1. Delete old primary and gallery_1
  const removed = await db.execute(sql`
    DELETE FROM product_images
    WHERE product_id = ${pid}
      AND url IN (
        '/objects/vendor-imports/TG_UM8810RT_primary.jpg',
        '/objects/vendor-imports/TG_UM8810RT_gallery_1.jpg'
      )
  `);
  console.log(`Removed ${removed.rowCount} old image rows`);

  // 2. Upload 3 new images
  const primaryUrl = await uploadFile(
    join(ASSETS_DIR, "UM8810RT_new_primary_1784224142187.png"),
    "UM8810RT-primary.png",
    "image/png",
  );
  const alt1Url = await uploadFile(
    join(ASSETS_DIR, "UM8810RT_alt1_1784224142188.png"),
    "UM8810RT-alt1.png",
    "image/png",
  );
  const alt2Url = await uploadFile(
    join(ASSETS_DIR, "UM8810RT_alt2_1784224142188.png"),
    "UM8810RT-alt2.png",
    "image/png",
  );
  console.log(`Uploaded: primary, alt1, alt2`);

  // 3. Insert new gallery rows
  await db.insert(productImagesTable).values([
    {
      productId: pid,
      url: primaryUrl,
      altText: "AUTO TILT 8'x10'",
      isPrimary: true,
      imageKind: "gallery",
      displayOrder: 0,
    },
    {
      productId: pid,
      url: alt1Url,
      altText: "AUTO TILT 8'x10'",
      isPrimary: false,
      imageKind: "gallery",
      displayOrder: 1,
    },
    {
      productId: pid,
      url: alt2Url,
      altText: "AUTO TILT 8'x10'",
      isPrimary: false,
      imageKind: "gallery",
      displayOrder: 2,
    },
  ]);
  console.log(`Inserted 3 new gallery rows`);

  // 4. Renumber remaining old images (gallery_2, gallery_3, gallery_4)
  await db.execute(sql`
    UPDATE product_images
    SET display_order = CASE
      WHEN url = '/objects/vendor-imports/TG_UM8810RT_gallery_2.jpg' THEN 3
      WHEN url = '/objects/vendor-imports/TG_UM8810RT_gallery_3.jpg' THEN 4
      WHEN url = '/objects/vendor-imports/TG_UM8810RT_gallery_4.jpg' THEN 5
    END
    WHERE product_id = ${pid}
      AND url LIKE '/objects/vendor-imports/TG_UM8810RT_gallery_%'
  `);
  console.log("Renumbered remaining old images");
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
