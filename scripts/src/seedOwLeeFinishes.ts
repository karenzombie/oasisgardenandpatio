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
  "../attached_assets/OWLee_Finishes_by_Product_1779836777740.csv",
);

const MANUFACTURER_NAME = "O.W. Lee";

// Display order base values per type
const BASE_ORDER: Record<string, number> = {
  "Frame Finish": 10,
  "Table Top Tile": 1010,
};

type CsvRow = {
  "Finish Type": string;
  "Finish Name": string;
  "Finish SKU/Code": string;
  "Finish Image URL": string;
  Collection: string;
  "Product Name": string;
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
  // Only require a finish name; code may be blank (e.g. Cielo, Trullo)
  const rows = parsed.data.filter((r) => r["Finish Name"]?.trim());
  console.log(`Parsed ${rows.length} CSV rows`);

  // --- 2. Collect distinct finishes ---------------------------------------
  // Deduplicate by "{finishType}|{name}" — code may be blank/non-unique
  const finishMap = new Map<
    string,
    {
      finishType: string;
      name: string;
      code: string | null;
      imageUrl: string;
    }
  >();

  for (const row of rows) {
    const name = row["Finish Name"].trim();
    const finishType = row["Finish Type"].trim();
    const code = row["Finish SKU/Code"].trim() || null;
    const imageUrl = row["Finish Image URL"].trim();
    const key = `${finishType}|${name}`;
    if (!finishMap.has(key)) {
      finishMap.set(key, { finishType, name, code, imageUrl });
    }
  }

  // Sort by type then name for stable display order assignment
  type FinishMeta = {
    finishType: string;
    name: string;
    code: string | null;
    imageUrl: string;
  };
  const finishesByType: Record<string, FinishMeta[]> = {};
  for (const f of finishMap.values()) {
    (finishesByType[f.finishType] ??= []).push(f);
  }
  for (const list of Object.values(finishesByType)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  console.log(
    `Distinct finishes: ${finishMap.size} (${Object.entries(finishesByType)
      .map(([t, l]) => `${l.length} ${t}`)
      .join(", ")})`,
  );

  // --- 3. Find O.W. Lee manufacturer -------------------------------------
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
  // Map "{finishType}|{name}" → DB finish id
  const keyToFinishId = new Map<string, number>();
  for (const [finishType, list] of Object.entries(finishesByType)) {
    const base = BASE_ORDER[finishType] ?? 10;
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
          description: finishType, // "Frame Finish" or "Table Top Tile"
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
            description: finishType,
            displayOrder,
            isActive: true,
          },
        })
        .returning({ id: finishesTable.id });
      keyToFinishId.set(`${finishType}|${f.name}`, row.id);
    }
  }
  console.log(`Upserted ${keyToFinishId.size} finishes`);

  // --- 5. Load O.W. Lee products from DB ---------------------------------
  const dbProducts = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, mfr.id));

  // Lookup map: normalized-lowercase name → id
  const nameToId = new Map<string, number>();
  for (const p of dbProducts) {
    nameToId.set(p.name.toLowerCase().trim(), p.id);
  }

  // --- 6. Build finish ↔ product links -----------------------------------
  const links: { productId: number; finishId: number }[] = [];
  const seenPairs = new Set<string>();
  let skippedFinish = 0;
  let skippedProduct = 0;

  for (const row of rows) {
    const name = row["Finish Name"].trim();
    const finishType = row["Finish Type"].trim();
    const finishId = keyToFinishId.get(`${finishType}|${name}`);
    if (!finishId) {
      skippedFinish++;
      continue;
    }

    // Prefer collection-prefixed name first (more specific), then raw name
    const rawName = row["Product Name"].trim();
    const collection = row["Collection"].trim();
    const candidates = [
      `${collection} ${rawName}`.toLowerCase(),
      rawName.toLowerCase(),
    ];
    let productId: number | undefined;
    for (const c of candidates) {
      productId = nameToId.get(c);
      if (productId !== undefined) break;
    }
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
