import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import {
  db,
  finishesTable,
  manufacturersTable,
  productsTable,
  productFinishOptionsTable,
} from "@workspace/db";

const CSV_PATH = resolve(
  process.cwd(),
  "../attached_assets/Tropitone_Finishes_by_Product_v3_1779841860235.csv",
);

const MANUFACTURER_NAME = "Tropitone";

// Display order base values per finish category.
// Lower base = shown first within the manufacturer accordion.
const BASE_ORDER: Record<string, number> = {
  "Frame Finish": 10,
  "MGP Color": 1010,
  "TropiKane Weave": 2010,
  "Rope Finish": 3010,
  "Woven Finish": 4010,
  "Fire Media Color": 5010,
};

type CsvRow = {
  "Finish Name": string;
  "Finish Code": string;
  "Finish Category": string;
  "Finish Image URL": string;
  Collection: string;
  "Sub-Collection": string;
  "Product Name": string;
  "Product SKU": string;
  "Product URL": string;
};

async function main() {
  // --- 1. Load + parse CSV -----------------------------------------------
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }
  const rows = parsed.data.filter((r) => r["Finish Name"]?.trim());
  console.log(`Parsed ${rows.length} CSV rows`);

  // --- 2. Collect distinct finishes (dedupe by category|name) ------------
  const finishMap = new Map<
    string,
    {
      category: string;
      name: string;
      code: string | null;
      imageUrl: string;
    }
  >();

  for (const row of rows) {
    const name = row["Finish Name"].trim();
    const category = row["Finish Category"].trim();
    const code = row["Finish Code"].trim() || null;
    const imageUrl = row["Finish Image URL"].trim();
    const key = `${category}|${name}`;
    if (!finishMap.has(key)) {
      finishMap.set(key, { category, name, code, imageUrl });
    }
  }

  // Sort by category then name for stable display order assignment
  type FinishMeta = {
    category: string;
    name: string;
    code: string | null;
    imageUrl: string;
  };
  const finishesByCategory: Record<string, FinishMeta[]> = {};
  for (const f of finishMap.values()) {
    (finishesByCategory[f.category] ??= []).push(f);
  }
  for (const list of Object.values(finishesByCategory)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  console.log(
    `Distinct finishes: ${finishMap.size} (${Object.entries(finishesByCategory)
      .map(([c, l]) => `${l.length} ${c}`)
      .join(", ")})`,
  );

  // --- 3. Find Tropitone manufacturer ------------------------------------
  const [mfr] = await db
    .select()
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfr) {
    throw new Error(
      `Manufacturer "${MANUFACTURER_NAME}" not found in DB. Run the main seed first.`,
    );
  }
  console.log(`Found manufacturer #${mfr.id} ${mfr.name}`);

  // --- 4. Upsert finishes ------------------------------------------------
  const keyToFinishId = new Map<string, number>();
  for (const [category, list] of Object.entries(finishesByCategory)) {
    const base = BASE_ORDER[category] ?? 10;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const displayOrder = base + i * 10;
      const [row] = await db
        .insert(finishesTable)
        .values({
          manufacturerId: mfr.id,
          itemNumber: f.code,
          name: f.name,
          imageUrl: f.imageUrl,
          description: f.category, // stored as the sub-group label
          isActive: true,
          displayOrder,
        })
        .onConflictDoUpdate({
          target: [
            finishesTable.manufacturerId,
            finishesTable.name,
            finishesTable.description,
          ],
          set: {
            itemNumber: f.code,
            imageUrl: f.imageUrl,
            displayOrder,
            isActive: true,
          },
        })
        .returning({ id: finishesTable.id });
      keyToFinishId.set(`${category}|${f.name}`, row.id);
    }
  }
  console.log(`Upserted ${keyToFinishId.size} finishes`);

  // --- 5. Load Tropitone products from DB (match by SKU) -----------------
  const dbProducts = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, mfr.id));

  const skuToId = new Map<string, number>();
  for (const p of dbProducts) {
    skuToId.set(p.sku.trim().toLowerCase(), p.id);
  }
  console.log(`Loaded ${dbProducts.length} Tropitone products from DB`);

  // --- 6. Build finish ↔ product links -----------------------------------
  const links: { productId: number; finishId: number }[] = [];
  const seenPairs = new Set<string>();
  let skippedFinish = 0;
  let skippedProduct = 0;

  for (const row of rows) {
    const name = row["Finish Name"].trim();
    const category = row["Finish Category"].trim();
    const finishId = keyToFinishId.get(`${category}|${name}`);
    if (!finishId) {
      skippedFinish++;
      continue;
    }

    const sku = row["Product SKU"].trim().toLowerCase();
    const productId = skuToId.get(sku);
    if (productId === undefined) {
      skippedProduct++;
      continue;
    }

    const key = `${productId}:${finishId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    links.push({ productId, finishId });
  }

  if (links.length > 0) {
    await db
      .insert(productFinishOptionsTable)
      .values(links)
      .onConflictDoNothing({
        target: [
          productFinishOptionsTable.productId,
          productFinishOptionsTable.finishId,
        ],
      });
  }
  console.log(
    `Linked ${links.length} product↔finish pairs ` +
      `(skipped ${skippedFinish} unknown-finish, ${skippedProduct} unmatched-product)`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
