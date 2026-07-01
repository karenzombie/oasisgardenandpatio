import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";

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
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/uploads/${filename}`;
}

// SKU → product id mapping (Galtech only, confirmed from DB)
const PRODUCTS: { productId: number; sku: string; altText: string; imageKey: string }[] = [
  { productId: 4946, sku: "BSTUBE15",      altText: "Base Tube 1.5\" dia, 12\" height",  imageKey: "bottom-pole" },
  { productId: 4953, sku: "BSTUBE-SQ-12",  altText: "Premium Base Tube 12.5\"",           imageKey: "bottom-pole" },
  { productId: 4954, sku: "BSTUBE-SQ-24",  altText: "Premium Base Tube 24\"",             imageKey: "bottom-pole" },
  { productId: 4966, sku: "BP",            altText: "Bottom Pole",                        imageKey: "bottom-pole" },
  { productId: 4967, sku: "BH",            altText: "Bar Height Pole",                    imageKey: "bottom-pole" },
  { productId: 4991, sku: "FRAME-ALU-725", altText: "Replacement Frame Aluminum - 725 7.5'", imageKey: "frame-only" },
  { productId: 4965, sku: "P-RIB",         altText: "Rib Assembly",                       imageKey: "parts" },
  { productId: 4968, sku: "P-HUB",         altText: "Runner Hub / Top Hub",               imageKey: "parts" },
  { productId: 4969, sku: "P-FINIAL",      altText: "Finial",                             imageKey: "parts" },
  { productId: 4970, sku: "P-PULLEYS",     altText: "2-Pulley Kit",                       imageKey: "parts" },
  { productId: 4971, sku: "P-PIN",         altText: "Pin & Chain Assembly",               imageKey: "parts" },
  { productId: 4972, sku: "TFORMER",       altText: "Transformer for Series 936/986",     imageKey: "parts" },
];

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const assetsDir = path.resolve(__dirname, "../../attached_assets");

  // Upload the 3 source images once each, then reuse the stored path.
  console.log("Uploading source images to Object Storage...");

  const bottomPoleBuffer = await readFile(
    path.join(assetsDir, "bottom-pole-umbrella.jpg_1782949672889.png"),
  );
  const frameOnlyBuffer = await readFile(
    path.join(assetsDir, "replacement-frame-only-1.jpg_1782949672889.png"),
  );
  const partsBuffer = await readFile(
    path.join(assetsDir, "replacement_parts_placeholder_1782949672889.png"),
  );

  const bottomPolePath = await uploadBuffer(bottomPoleBuffer, "image/png", "galtech-bottom-pole-umbrella.png");
  console.log("  bottom-pole →", bottomPolePath);

  const frameOnlyPath = await uploadBuffer(frameOnlyBuffer, "image/png", "galtech-replacement-frame-only.png");
  console.log("  frame-only  →", frameOnlyPath);

  const partsPath = await uploadBuffer(partsBuffer, "image/png", "galtech-replacement-parts-placeholder.png");
  console.log("  parts       →", partsPath);

  const pathByKey: Record<string, string> = {
    "bottom-pole": bottomPolePath,
    "frame-only":  frameOnlyPath,
    "parts":       partsPath,
  };

  console.log("\nInserting product_images rows...");
  for (const p of PRODUCTS) {
    const url = pathByKey[p.imageKey];
    await db.insert(productImagesTable).values({
      productId: p.productId,
      url,
      altText: p.altText,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    });
    console.log(`  ✓ ${p.sku} (id ${p.productId}) → ${url}`);
  }

  console.log("\nDone — 12 products updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
