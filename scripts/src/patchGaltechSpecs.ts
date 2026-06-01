/**
 * Parses the pipe-delimited specs from the Galtech products CSV and writes
 * a structured JSON object to products.specs for each Galtech product.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/patchGaltechSpecs.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const PRODUCTS_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_products_1780285430825.csv",
);

type ProductRow = {
  category: string;
  model_number: string;
  product_name: string;
  product_url: string;
  specs: string;
};

// ---------------------------------------------------------------------------
// Parse a pipe-delimited spec string into a structured key→value object.
// Priority patterns (applied in order):
//   "Pole Diameter X"          → { "Pole Diameter": "X" }
//   "X Ribs"                   → { "Ribs": "X" }
//   "X year warranty …"        → { "Warranty": "X year …" } (normalised)
//   "Key: Value"               → direct split
//   "Lift / tilt description"  → { "Lift / Tilt": "…" }
//   Everything else            → stored under sequential "Feature X" keys
// ---------------------------------------------------------------------------

function parseSpecs(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let featureN = 1;

  const items = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const item of items) {
    // "Pole Diameter X"
    const poleDiam = item.match(/^Pole Diameter\s+(.+)$/i);
    if (poleDiam) {
      result["Pole Diameter"] = poleDiam[1].trim();
      continue;
    }

    // "X Ribs" or "X fiberglass ribs" etc.
    const ribs = item.match(/^(\d+)\s+(?:flexible\s+)?(?:fiberglass\s+)?ribs?$/i);
    if (ribs) {
      result["Ribs"] = ribs[1];
      continue;
    }

    // "X year warranty …"
    const warranty = item.match(/^(\d+)\s+year\s+warranty.*/i);
    if (warranty) {
      result["Warranty"] = item.trim();
      continue;
    }

    // "Ideal shade coverage: …" or any "Key: Value"
    const colonIdx = item.indexOf(": ");
    if (colonIdx !== -1) {
      const key = item.slice(0, colonIdx).trim();
      const val = item.slice(colonIdx + 2).trim();
      result[key] = val;
      continue;
    }

    // "Crank Lift …" / "Manual Lift" / "Quad Pulleys …" → Lift / Raise
    if (/lift|pulley|pulleys/i.test(item) && !/ideal/i.test(item)) {
      result["Lift / Raise"] = item.trim();
      continue;
    }

    // "Auto Tilt" / "Manual Tilt" / "Rotational Tilt" → Tilt
    if (/tilt/i.test(item) && !/housing/i.test(item) && !/mechanism/i.test(item)) {
      result["Tilt"] = item.trim();
      continue;
    }

    // "Residential applications" / "Commercial or Residential applications"
    if (/applications?/i.test(item)) {
      result["Applications"] = item.replace(/\s+applications?/i, "").trim();
      continue;
    }

    // "X lbs" weight
    const weight = item.match(/^(\d+(?:\.\d+)?)\s*lbs?\.?$/i);
    if (weight) {
      result["Weight"] = `${weight[1]} lbs`;
      continue;
    }

    // Everything else → numbered feature
    result[`Feature ${featureN++}`] = item;
  }

  return result;
}

async function main() {
  const raw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsed = Papa.parse<ProductRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  let updated = 0;
  let skipped = 0;

  for (const row of parsed.data) {
    const modelNumber = row.model_number?.trim();
    const specs = row.specs?.trim();

    if (!modelNumber || !specs) {
      skipped++;
      continue;
    }

    const sku = `GT-${modelNumber}`;
    const specsJson = parseSpecs(specs);

    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (!product) {
      console.warn(`  WARN: no product found for SKU=${sku}`);
      skipped++;
      continue;
    }

    await db
      .update(productsTable)
      .set({ specs: specsJson })
      .where(eq(productsTable.id, product.id));

    console.log(`  ✓ ${product.name} (${sku}) → ${Object.keys(specsJson).length} spec keys`);
    updated++;
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
