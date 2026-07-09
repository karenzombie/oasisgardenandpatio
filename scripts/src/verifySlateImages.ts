import { readFileSync } from "fs";
import { resolve } from "path";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, inArray, and, like } from "drizzle-orm";

const textPath = resolve(process.cwd(), "../attached_assets/Pasted-Slate-Image-Assignments-All-filenames-are-in-the-Homecr_1783558656681.txt");
const text = readFileSync(textPath, "utf-8");

// Build SKU→image mapping from the text file.
// Format: each line is "SKUImage<sku1><img1.jpg><sku2><img2.jpg>..."
// SKUs and image names are directly adjacent with no delimiter.
// We use the database as ground truth: try known SKUs as prefixes.

function parseLine(data: string, knownSkus: Set<string>): Array<{ sku: string; image: string }> {
  const pairs: Array<{ sku: string; image: string }> = [];
  let remaining = data;

  while (remaining.length > 0) {
    // Find the next .jpg
    const jpgIdx = remaining.indexOf('.jpg');
    if (jpgIdx === -1) break;

    // The segment before .jpg contains both SKU and image name.
    // We try all known SKUs as prefixes of this segment.
    const segment = remaining.slice(0, jpgIdx);
    let found = false;

    // Try longest SKU first (to avoid matching short prefixes)
    for (const sku of knownSkus) {
      if (segment.startsWith(sku)) {
        const imageName = segment.slice(sku.length);
        if (imageName.length > 0) {
          pairs.push({ sku, image: imageName + '.jpg' });
          remaining = remaining.slice(jpgIdx + 4);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Fallback: try matching by pattern (image names typically end with RSL/SSL/FSL/BSL/XSL)
      const suffixMatch = segment.match(/^(.*?)([A-Z0-9\-]+)$/);
      if (suffixMatch) {
        const [_, possibleSku, imageName] = suffixMatch;
        pairs.push({ sku: possibleSku, image: imageName + '.jpg' });
      }
      remaining = remaining.slice(jpgIdx + 4);
    }
  }

  return pairs;
}

async function main() {
  // Get all Slate product SKUs from DB
  const slateProducts = await db.select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(and(eq(productsTable.manufacturerId, 16), like(productsTable.name, '%Slate%')));

  const knownSkus = new Set(slateProducts.map(p => p.sku));
  const skuToProduct = new Map(slateProducts.map(p => [p.sku, p]));

  // Parse text file
  const mapping: Record<string, string> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t || !t.includes('.jpg')) continue;
    const data = t.startsWith('SKUImage') ? t.slice(8) : t;
    const pairs = parseLine(data, knownSkus);
    for (const { sku, image } of pairs) {
      if (mapping[sku]) {
        console.warn(`Duplicate SKU mapping: ${sku} → ${mapping[sku]} (also ${image})`);
      }
      mapping[sku] = image;
    }
  }

  const allSkus = Object.keys(mapping);
  console.log(`Parsed ${allSkus.length} SKU→image assignments\n`);

  // Check that parsed SKUs exist in DB
  const missingDb = allSkus.filter(s => !skuToProduct.has(s));
  if (missingDb.length) {
    console.warn('SKUs in text file but NOT in DB:', missingDb.length);
    for (const sku of missingDb) {
      console.warn(`  ${sku} → ${mapping[sku]}`);
    }
  }

  // Check existing images
  const validSkus = allSkus.filter(s => skuToProduct.has(s));
  const productIds = validSkus.map(s => skuToProduct.get(s)!.id);
  const existing = await db.select({ productId: productImagesTable.productId, url: productImagesTable.url, imageKind: productImagesTable.imageKind })
    .from(productImagesTable)
    .where(and(inArray(productImagesTable.productId, productIds), eq(productImagesTable.imageKind, 'gallery')));

  const byProduct = new Map<number, typeof existing>();
  for (const row of existing) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, []);
    byProduct.get(row.productId)!.push(row);
  }

  let matches = 0;
  let mismatches = 0;

  for (const sku of validSkus) {
    const product = skuToProduct.get(sku)!;
    const expectedImage = mapping[sku];
    const productImages = byProduct.get(product.id) || [];

    if (productImages.length === 0) {
      console.log(`${sku}: NO GALLERY IMAGE → expected ${expectedImage}`);
      mismatches++;
    } else {
      const actualUrl = productImages[0].url;
      const expectedName = expectedImage.replace('.jpg', '');
      if (actualUrl.includes(expectedName)) {
        matches++;
      } else {
        console.log(`${sku}: MISMATCH → expected ${expectedImage} but got ${actualUrl.split('/').pop()}`);
        mismatches++;
      }
    }
  }

  console.log(`\nResults: ${matches} correct, ${mismatches} mismatched/missing`);
  console.log(`Valid SKUs: ${validSkus.length}, Missing from DB: ${missingDb.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
