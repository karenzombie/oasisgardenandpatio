/**
 * Seed script: TG accessory products (mount kits, stems, battery pack, lights)
 *
 * 1. Insert product_variants (finish-in-variant) for products that require
 *    finish selection before add-to-cart.
 * 2. Upload product images from treasure_garden_light_images/ and insert
 *    product_images rows (primary + supplemental).
 * 3. Upload the battery pack PDF and store it in the product specs JSONB so
 *    the PDP specs tab renders it as a "View PDF" hyperlink.
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import {
  productVariantsTable,
  productImagesTable,
  productsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GCS client (Replit sidecar auth — same pattern as other upload scripts)
// ---------------------------------------------------------------------------
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

// objectPath → public URL the browser can navigate to
function publicUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

// ---------------------------------------------------------------------------
// Finish definitions (TG manufacturer_id = 12)
// ids confirmed from DB query
// ---------------------------------------------------------------------------
const FINISH = {
  BRONZE: { id: 1, name: "Bronze", itemNumber: "00" },
  ANTHRACITE: { id: 2, name: "Anthracite", itemNumber: "02" },
  WHITE: { id: 3, name: "White", itemNumber: "03" },
  BLACK: { id: 4, name: "Black", itemNumber: "09" },
  ARCH_BRONZE: { id: 5, name: "Architectural Bronze", itemNumber: "AB" },
  ARCTIC_WHITE: { id: 6, name: "Arctic White", itemNumber: "AW" },
  SAND: { id: 7, name: "Sand", itemNumber: "SD" },
  SHADOW_GRAPHITE: { id: 8, name: "Shadow Graphite", itemNumber: "SG" },
} as const;

// ---------------------------------------------------------------------------
// Product definitions
// ids confirmed from DB query
// ---------------------------------------------------------------------------

// Products with NO finish variants (no action needed — confirmed no variants required)
// 5625: AMK-C22, 5626: AMK-G, 5627: AMK-W, 5628: MKC23, 5629: MKG23

interface VariantDef {
  variantSku: string;
  variantName: string;
  displayOrder: number;
}

interface ProductDef {
  productId: number;
  sku: string;
  variants: VariantDef[];
}

const VARIANT_PRODUCTS: ProductDef[] = [
  // MKW21 | Wood Deck Mount Kit | finish: 09 (Black) only
  {
    productId: 5630,
    sku: "MKW21",
    variants: [
      { variantSku: "MKW21-09", variantName: "Black", displayOrder: 0 },
    ],
  },

  // MKSB21-_ | External Stem | finishes: SG, AB, AW, SD
  {
    productId: 5631,
    sku: "MKSB21-_",
    variants: [
      { variantSku: "MKSB21-SG", variantName: "Shadow Graphite", displayOrder: 0 },
      { variantSku: "MKSB21-AB", variantName: "Architectural Bronze", displayOrder: 1 },
      { variantSku: "MKSB21-AW", variantName: "Arctic White", displayOrder: 2 },
      { variantSku: "MKSB21-SD", variantName: "Sand", displayOrder: 3 },
    ],
  },

  // BT2-_ | Aluminum Stem for 2" Poles | finishes: 0 (Bronze), 2 (Anthracite), 3 (White), 9 (Black)
  {
    productId: 5632,
    sku: "BT2-_",
    variants: [
      { variantSku: "BT2-0", variantName: "Bronze", displayOrder: 0 },
      { variantSku: "BT2-2", variantName: "Anthracite", displayOrder: 1 },
      { variantSku: "BT2-3", variantName: "White", displayOrder: 2 },
      { variantSku: "BT2-9", variantName: "Black", displayOrder: 3 },
    ],
  },

  // BT218-_ | Aluminum Stem for 2" Poles (BW50 Series) | finishes: 0, 2, 3, 9
  {
    productId: 5633,
    sku: "BT218-_",
    variants: [
      { variantSku: "BT218-0", variantName: "Bronze", displayOrder: 0 },
      { variantSku: "BT218-2", variantName: "Anthracite", displayOrder: 1 },
      { variantSku: "BT218-3", variantName: "White", displayOrder: 2 },
      { variantSku: "BT218-9", variantName: "Black", displayOrder: 3 },
    ],
  },

  // P-AKZPBATTERY-_ | Starlux AKZ Plus Rechargeable Battery Pack | finishes: 00 (Bronze), 09 (Black)
  {
    productId: 5634,
    sku: "P-AKZPBATTERY-_",
    variants: [
      { variantSku: "P-AKZPBATTERY-00", variantName: "Bronze", displayOrder: 0 },
      { variantSku: "P-AKZPBATTERY-09", variantName: "Black", displayOrder: 1 },
    ],
  },

  // EVO-_ | EVO Dual-Light Sound Pod | finishes: 03 (White), 09 (Black)
  {
    productId: 5635,
    sku: "EVO-_",
    variants: [
      { variantSku: "EVO-03", variantName: "White", displayOrder: 0 },
      { variantSku: "EVO-09", variantName: "Black", displayOrder: 1 },
    ],
  },

  // LUNAPRO-_ | Luna Pro Multicolor Umbrella Light | finishes: 00 (Bronze), 09 (Black)
  {
    productId: 5636,
    sku: "LUNAPRO-_",
    variants: [
      { variantSku: "LUNAPRO-00", variantName: "Bronze", displayOrder: 0 },
      { variantSku: "LUNAPRO-09", variantName: "Black", displayOrder: 1 },
    ],
  },

  // HALO-_ | Halo Umbrella Light | finishes: 00 (Bronze), 09 (Black)
  {
    productId: 5637,
    sku: "HALO-_",
    variants: [
      { variantSku: "HALO-00", variantName: "Bronze", displayOrder: 0 },
      { variantSku: "HALO-09", variantName: "Black", displayOrder: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Image definitions
// Files in treasure_garden_light_images/ at workspace root
// ---------------------------------------------------------------------------
interface ImageDef {
  filename: string;
  contentType: string;
  storageFilename: string; // stable name in object storage
  isPrimary: boolean;
  displayOrder: number;
  altText: string;
}

interface ProductImagesDef {
  productId: number;
  sku: string;
  images: ImageDef[];
}

const PRODUCT_IMAGES: ProductImagesDef[] = [
  {
    productId: 5635,
    sku: "EVO-_",
    images: [
      {
        filename: "Product_EVO_primary.jpg",
        contentType: "image/jpeg",
        storageFilename: "tg-evo-primary.jpg",
        isPrimary: true,
        displayOrder: 0,
        altText: "EVO Dual-Light Sound Pod",
      },
      {
        filename: "Product_EVO_2.gif",
        contentType: "image/gif",
        storageFilename: "tg-evo-2.gif",
        isPrimary: false,
        displayOrder: 1,
        altText: "EVO Dual-Light Sound Pod",
      },
      {
        filename: "Evo_3.png",
        contentType: "image/png",
        storageFilename: "tg-evo-3.png",
        isPrimary: false,
        displayOrder: 2,
        altText: "EVO Dual-Light Sound Pod",
      },
      {
        filename: "evo_4.png",
        contentType: "image/png",
        storageFilename: "tg-evo-4.png",
        isPrimary: false,
        displayOrder: 3,
        altText: "EVO Dual-Light Sound Pod",
      },
      {
        filename: "evo_5.png",
        contentType: "image/png",
        storageFilename: "tg-evo-5.png",
        isPrimary: false,
        displayOrder: 4,
        altText: "EVO Dual-Light Sound Pod",
      },
    ],
  },
  {
    productId: 5637,
    sku: "HALO-_",
    images: [
      {
        filename: "Product_HALO_primary.jpg",
        contentType: "image/jpeg",
        storageFilename: "tg-halo-primary.jpg",
        isPrimary: true,
        displayOrder: 0,
        altText: "Halo Umbrella Light",
      },
      {
        filename: "Product_HALO_2.jpg",
        contentType: "image/jpeg",
        storageFilename: "tg-halo-2.jpg",
        isPrimary: false,
        displayOrder: 1,
        altText: "Halo Umbrella Light",
      },
      {
        filename: "halo_3.png",
        contentType: "image/png",
        storageFilename: "tg-halo-3.png",
        isPrimary: false,
        displayOrder: 2,
        altText: "Halo Umbrella Light",
      },
    ],
  },
  {
    productId: 5636,
    sku: "LUNAPRO-_",
    images: [
      {
        filename: "Product_LUNAPRO_primary.jpg",
        contentType: "image/jpeg",
        storageFilename: "tg-lunapro-primary.jpg",
        isPrimary: true,
        displayOrder: 0,
        altText: "Luna Pro Multicolor Umbrella Light",
      },
      {
        filename: "Product_LUNAPRO_2.gif",
        contentType: "image/gif",
        storageFilename: "tg-lunapro-2.gif",
        isPrimary: false,
        displayOrder: 1,
        altText: "Luna Pro Multicolor Umbrella Light",
      },
      {
        filename: "lunapro_3.png",
        contentType: "image/png",
        storageFilename: "tg-lunapro-3.png",
        isPrimary: false,
        displayOrder: 2,
        altText: "Luna Pro Multicolor Umbrella Light",
      },
    ],
  },
  {
    productId: 5634,
    sku: "P-AKZPBATTERY-_",
    images: [
      {
        filename: "Gallery_AKZPLX_battery.jpg",
        contentType: "image/jpeg",
        storageFilename: "tg-akzpbattery-primary.jpg",
        isPrimary: true,
        displayOrder: 0,
        altText: "Starlux AKZ Plus Rechargeable Battery Pack",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(
    __dirname,
    "../../treasure_garden_light_images",
  );
  const assetsDir = path.resolve(__dirname, "../../attached_assets");

  // ── 1. Insert product variants ──────────────────────────────────────────
  console.log("\n=== Inserting product variants ===");
  for (const prod of VARIANT_PRODUCTS) {
    for (const v of prod.variants) {
      await db
        .insert(productVariantsTable)
        .values({
          productId: prod.productId,
          variantSku: v.variantSku,
          variantName: v.variantName,
          optionLabel: "Frame Finish",
          priceAdjustment: "0",
          displayOrder: v.displayOrder,
          isActive: true,
        })
        .onConflictDoNothing();
      console.log(`  ✓ ${prod.sku} → ${v.variantSku} (${v.variantName})`);
    }
  }

  // ── 2. Upload images & insert product_images ────────────────────────────
  console.log("\n=== Uploading images & inserting product_images ===");
  for (const prod of PRODUCT_IMAGES) {
    for (const img of prod.images) {
      const filePath = path.join(imagesDir, img.filename);
      const buffer = await readFile(filePath);
      const objectPath = await uploadBuffer(
        buffer,
        img.contentType,
        img.storageFilename,
      );
      await db
        .insert(productImagesTable)
        .values({
          productId: prod.productId,
          url: objectPath,
          altText: img.altText,
          isPrimary: img.isPrimary,
          displayOrder: img.displayOrder,
          imageKind: "gallery",
        })
        .onConflictDoNothing();
      console.log(
        `  ✓ ${prod.sku} ${img.isPrimary ? "(primary)" : `(supplemental #${img.displayOrder})`} → ${objectPath}`,
      );
    }
  }

  // ── 3. Upload battery pack PDF & update specs JSONB ────────────────────
  console.log("\n=== Uploading battery pack PDF ===");
  const pdfBuffer = await readFile(
    path.join(assetsDir, "TG_P-AKZPBATTERY_Manual_0520_1782963246698.pdf"),
  );
  const pdfObjectPath = await uploadBuffer(
    pdfBuffer,
    "application/pdf",
    "tg-akzpbattery-manual.pdf",
  );
  const pdfPublicUrl = publicUrl(pdfObjectPath);
  console.log(`  ✓ PDF uploaded → ${pdfObjectPath}`);

  await db
    .update(productsTable)
    .set({
      specs: { "Assembly Manual (PDF)": pdfPublicUrl },
    })
    .where(eq(productsTable.id, 5634));
  console.log(`  ✓ P-AKZPBATTERY specs updated with PDF link`);

  console.log("\n✅ Done — TG accessories fully wired up.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
