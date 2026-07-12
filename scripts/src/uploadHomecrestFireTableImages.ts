/**
 * Upload Homecrest fire table product images from attached_assets/ to Object Storage
 * and link them to the correct products via product_images table.
 *
 * Products:
 *   42RCTFPTT+89RNC (Concrete Lounge Fire Table Round 42") → concrete top image
 *   42RTMFPTT+89RNC (Timber Lounge Fire Table Round 42") → timber top image
 *   54RCTFPTT+89RNC (Concrete Lounge Fire Table Round 54") → concrete top image
 *   54RTMFPTT+89RNC (Timber Lounge Fire Table Round 54") → timber top image
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { db, productImagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { uploadBufferToStorage } from "../../artifacts/api-server/src/lib/objectStorage.js";

const IMAGE_DIR = resolve(process.cwd(), "..", "attached_assets");

const MAPPING = [
  {
    sku: "42RCTFPTT+89RNC",
    filename: "42RCTFPTT_89RNC_1783897881186.jpg",
    altText: "Homecrest 42\" Concrete Lounge Fire Table",
  },
  {
    sku: "42RTMFPTT+89RNC",
    filename: "42RTMFPTT_89RNC_1783897881186.jpg",
    altText: "Homecrest 42\" Timber Lounge Fire Table",
  },
  {
    sku: "54RCTFPTT+89RNC",
    filename: "54RCTFPTT_89RNC_1783897881186.jpg",
    altText: "Homecrest 54\" Concrete Lounge Fire Table",
  },
  {
    sku: "54RTMFPTT+89RNC",
    filename: "54RTMFPTT_89RNC_1783897881186.jpg",
    altText: "Homecrest 54\" Timber Lounge Fire Table",
  },
];

async function main() {
  for (const entry of MAPPING) {
    const filePath = resolve(IMAGE_DIR, entry.filename);
    const buffer = readFileSync(filePath);

    // Upload to Object Storage
    const objectPath = await uploadBufferToStorage(buffer, "image/jpeg", "vendor-imports");
    console.log(`Uploaded ${entry.filename} → ${objectPath}`);

    // Look up product by SKU
    const productRows = await db.execute(
      `SELECT id FROM products WHERE sku = '${entry.sku}'`,
    );
    if (!productRows.rows.length) {
      console.error(`Product not found for SKU ${entry.sku}`);
      continue;
    }
    const productId = Number(productRows.rows[0].id);

    // Check if this product already has any gallery images
    const existingImages = await db
      .select()
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, productId));

    const isPrimary = existingImages.length === 0;

    // Insert into product_images
    await db.insert(productImagesTable).values({
      productId,
      url: objectPath,
      imageKind: "gallery",
      isPrimary,
      displayOrder: existingImages.length,
    });

    console.log(`Linked ${objectPath} to product ${entry.sku} (id=${productId}, primary=${isPrimary})`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
