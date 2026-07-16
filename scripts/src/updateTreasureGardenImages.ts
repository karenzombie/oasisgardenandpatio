import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";

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
  // ---- UM847SQ: rename, swap primary to gallery_2 ----
  const um847 = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, "UM847SQ"));
  if (um847.length === 0) throw new Error("UM847SQ not found");
  const um847Id = um847[0].id;

  // Rename product
  await db
    .update(productsTable)
    .set({ name: "Flex 7.5' Square" })
    .where(eq(productsTable.id, um847Id));
  console.log("UM847SQ: renamed to 'Flex 7.5\\' Square'");

  // Delete current primary
  await db
    .delete(productImagesTable)
    .where(
      and(
        eq(productImagesTable.productId, um847Id),
        eq(productImagesTable.isPrimary, true),
      ),
    );
  console.log(`UM847SQ: deleted old primary image(s)`);

  // Upload gallery_2 as new primary
  const umGallery2Path = join(
    import.meta.dirname,
    "../../tg_images/UM847SQ/gallery_2.jpg",
  );
  const umPrimaryUrl = await uploadFile(
    umGallery2Path,
    "UM847SQ-primary.jpg",
    "image/jpeg",
  );
  await db.insert(productImagesTable).values({
    productId: um847Id,
    url: umPrimaryUrl,
    altText: "Flex 7.5' Square",
    isPrimary: true,
    imageKind: "gallery",
    displayOrder: 0,
  });
  console.log(`UM847SQ: uploaded new primary → ${umPrimaryUrl}`);

  // ---- AKZPRTLX: remove primary, upload new ----
  const akz = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, "AKZPRTLX"));
  if (akz.length === 0) throw new Error("AKZPRTLX not found");
  const akzId = akz[0].id;

  // Delete current primary
  await db
    .delete(productImagesTable)
    .where(
      and(
        eq(productImagesTable.productId, akzId),
        eq(productImagesTable.isPrimary, true),
      ),
    );
  console.log(`AKZPRTLX: deleted old primary image(s)`);

  // Upload attached image as new primary
  const akzPath = join(
    import.meta.dirname,
    "../../attached_assets/AKZPRTLX_primary_1784223681729.png",
  );
  const akzPrimaryUrl = await uploadFile(
    akzPath,
    "AKZPRTLX-primary.png",
    "image/png",
  );
  await db.insert(productImagesTable).values({
    productId: akzId,
    url: akzPrimaryUrl,
    altText: "STARLUX AKZ PLUS 10'x13'",
    isPrimary: true,
    imageKind: "gallery",
    displayOrder: 0,
  });
  console.log(`AKZPRTLX: uploaded new primary → ${akzPrimaryUrl}`);

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
