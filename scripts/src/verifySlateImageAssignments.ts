import { readFileSync } from "fs";
import { resolve } from "path";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";

const textPath = resolve(process.cwd(), "../attached_assets/Pasted-Slate-Image-Assignments-All-filenames-are-in-the-Homecr_1783558656681.txt");
const text = readFileSync(textPath, "utf-8");

// Parse SKU→image mapping from the text file.
// Each data line starts with "SKUImage" then alternates: SKU, filename.jpg, SKU, filename.jpg...
// SKUs and filenames are directly adjacent with no delimiter.
const mapping: Record<string, string> = {};
const lines = text.split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t || !t.includes('.jpg')) continue;

  // Strip leading "SKUImage" prefix
  const data = t.startsWith('SKUImage') ? t.slice(8) : t;

  // Find every .jpg position
  const jpgPositions: number[] = [];
  let idx = 0;
  while ((idx = data.indexOf('.jpg', idx)) !== -1) {
    jpgPositions.push(idx);
    idx += 4;
  }

  let prevEnd = 0;
  for (const pos of jpgPositions) {
    // The filename is the part ending at pos+4. We need to find where it starts.
    // Filenames typically start with an uppercase letter or digit.
    // Search backward from pos for the first char that looks like a filename start.
    const segmentBeforeDot = data.slice(prevEnd, pos);
    // The filename is at the end of segmentBeforeDot.
    // Find the first uppercase letter in segmentBeforeDot (filename start)
    const filenameStart = segmentBeforeDot.search(/[A-Z0-9]/);
    if (filenameStart === -1) {
      prevEnd = pos + 4;
      continue;
    }
    const sku = segmentBeforeDot.slice(0, filenameStart);
    const filename = segmentBeforeDot.slice(filenameStart) + '.jpg';
    if (sku && filename) {
      mapping[sku] = filename;
    }
    prevEnd = pos + 4;
  }
}

async function main() {
  const allSkus = Object.keys(mapping);
  console.log(`Parsed ${allSkus.length} SKU→image assignments\n`);

  // Check that all SKUs exist in the database
  const products = await db.select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable).where(inArray(productsTable.sku, allSkus));

  const skuToProduct = new Map(products.map(p => [p.sku, p]));
  const missingDb = allSkus.filter(s => !skuToProduct.has(s));
  if (missingDb.length) {
    console.warn('Missing from DB:', missingDb.join(', '));
  }

  // Check existing images for these products
  const productIds = products.map(p => p.id);
  const existing = await db.select({ productId: productImagesTable.productId, url: productImagesTable.url })
    .from(productImagesTable)
    .where(and(inArray(productImagesTable.productId, productIds), eq(productImagesTable.imageKind, 'gallery')));

  let matches = 0;
  let mismatches = 0;
  let missing = 0;

  for (const sku of allSkus) {
    const product = skuToProduct.get(sku);
    if (!product) { missing++; continue; }

    const expectedImage = mapping[sku];
    const productImages = existing.filter(r => r.productId === product.id);

    if (productImages.length === 0) {
      console.log(`${sku} (id ${product.id}): NO IMAGE → expected ${expectedImage}`);
      mismatches++;
    } else {
      const actualUrl = productImages[0].url;
      // Check if URL contains the expected image name (without .jpg)
      const expectedStorageName = expectedImage.replace('.jpg', '');
      if (actualUrl.includes(expectedStorageName)) {
        matches++;
      } else {
        console.log(`${sku}: MISMATCH → expected ${expectedImage} but got ${actualUrl}`);
        mismatches++;
      }
    }
  }

  console.log(`\nResults: ${matches} correct, ${mismatches} mismatched/missing, ${missing} missing from DB`);
  console.log(`Total expected mappings: ${allSkus.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
