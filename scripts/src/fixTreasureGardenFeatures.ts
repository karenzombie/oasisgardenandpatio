/**
 * One-off repair: Treasure Garden product descriptions are semicolon-separated
 * feature lists stored as a single paragraph in `products.description`. Because
 * the PDP Features tab shows only the *second paragraph* (after the first
 * blank-line split), the tab was always empty for TG products.
 *
 * This script restructures each TG product's `description` as:
 *   <short_description as top blurb>
 *
 *   <features as an HTML <ul> list>
 *
 * Source of truth: attached_assets/treasure_garden_descriptions_1780423516810.csv
 * For any product not in the CSV, the existing DB description is used as the
 * feature list.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/fixTreasureGardenFeatures.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, ilike } from "drizzle-orm";
import { db, productsTable, manufacturersTable } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCsv(filePath: string): Map<string, string> {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  const headers = parseLine(lines[0] ?? "");
  const skuIdx = headers.indexOf("sku");
  const descIdx = headers.indexOf("description");

  const map = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cols = parseLine(line);
    const sku = cols[skuIdx]?.trim();
    const desc = cols[descIdx]?.trim();
    if (sku && desc) map.set(sku, desc);
  }
  return map;
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function featuresToHtml(raw: string): string {
  const bullets = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (bullets.length === 0) return "";
  const items = bullets.map((b) => `  <li>${b}</li>`).join("\n");
  return `<ul>\n${items}\n</ul>`;
}

async function main() {
  const csvPath = path.resolve(
    __dirname,
    "../../attached_assets/treasure_garden_descriptions_1780423516810.csv"
  );

  console.log("Loading CSV…");
  const csvBySku = parseCsv(csvPath);
  console.log(`  ${csvBySku.size} entries loaded`);

  console.log("Querying TG products…");
  const tgProducts = await db
    .select({
      id: productsTable.id,
      sku: productsTable.sku,
      shortDescription: productsTable.shortDescription,
      description: productsTable.description,
    })
    .from(productsTable)
    .innerJoin(
      manufacturersTable,
      eq(productsTable.manufacturerId, manufacturersTable.id)
    )
    .where(ilike(manufacturersTable.name, "%treasure%"));

  console.log(`  ${tgProducts.length} TG products found\n`);

  let updated = 0;
  let skipped = 0;
  let noFeatures = 0;

  for (const product of tgProducts) {
    const rawFeatures =
      csvBySku.get(product.sku) ?? product.description ?? "";

    const featuresHtml = featuresToHtml(rawFeatures);

    if (!featuresHtml) {
      console.log(`  SKIP  ${product.sku} — no features content`);
      noFeatures++;
      continue;
    }

    const topBlurb = (product.shortDescription ?? "").trim();
    const newDescription = topBlurb
      ? `${topBlurb}\n\n${featuresHtml}`
      : featuresHtml;

    if (product.description === newDescription) {
      skipped++;
      continue;
    }

    await db
      .update(productsTable)
      .set({ description: newDescription })
      .where(eq(productsTable.id, product.id));

    console.log(`  OK    ${product.sku}`);
    updated++;
  }

  console.log(
    `\nDone: ${updated} updated, ${skipped} already correct, ${noFeatures} no features`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
