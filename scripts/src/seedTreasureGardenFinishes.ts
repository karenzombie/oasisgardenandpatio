import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  finishesTable,
  manufacturersTable,
  productsTable,
  productFinishOptionsTable,
} from "@workspace/db";

const CSV_PATH = resolve(
  process.cwd(),
  "../attached_assets/Treasure_Garden_Finishes_by_Product_1779833470581.csv",
);

const MANUFACTURER_NAME = "Treasure Garden";

// Finish codes the user explicitly asked to omit (no swatch supplied).
// 5T (Platinum) and the TOUCHUP-* codes also have no swatch image so are
// naturally excluded by the FINISH_META lookup below.
const OMIT_CODES = new Set(["1H", "CHAMP"]);

// Code → display name + display order. Only codes listed here will be
// seeded as a finish. Image URLs match the composited files at
// artifacts/web/public/finish-swatches/finish-<CODE>.jpg.
const FINISH_META: Record<
  string,
  { name: string; displayOrder: number }
> = {
  "00": { name: "Bronze", displayOrder: 10 },
  "02": { name: "Anthracite", displayOrder: 20 },
  "03": { name: "White", displayOrder: 30 },
  "09": { name: "Black", displayOrder: 40 },
  AB: { name: "Architectural Bronze", displayOrder: 50 },
  AW: { name: "Arctic White", displayOrder: 60 },
  SD: { name: "Sand", displayOrder: 70 },
  SG: { name: "Shadow Graphite", displayOrder: 80 },
  SS: { name: "Silver Shadow, Anodized", displayOrder: 90 },
  WO: { name: "Weathered Oak", displayOrder: 100 },
};

type CsvRow = {
  "Finish Color Name": string;
  "Finish Code": string;
  "Product Name": string;
  "Product SKU": string;
};

async function main() {
  // --- 1. Load + parse CSV ----------------------------------------------
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }
  const rows = parsed.data.filter((r) => r["Finish Code"] && r["Product SKU"]);
  console.log(`Parsed ${rows.length} CSV rows`);

  // --- 2. Find/create Treasure Garden manufacturer ----------------------
  let [mfr] = await db
    .select()
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfr) {
    [mfr] = await db
      .insert(manufacturersTable)
      .values({
        name: MANUFACTURER_NAME,
        slug: "treasure-garden",
        isActive: true,
      })
      .returning();
    console.log(`Created manufacturer #${mfr.id} ${MANUFACTURER_NAME}`);
  } else {
    console.log(`Found manufacturer #${mfr.id} ${MANUFACTURER_NAME}`);
  }

  // --- 3. Upsert finishes ------------------------------------------------
  const codeToFinishId = new Map<string, number>();
  for (const [code, meta] of Object.entries(FINISH_META)) {
    if (OMIT_CODES.has(code)) continue;
    const imageUrl = `/finish-swatches/finish-${code}.jpg`;
    // unique(manufacturerId, name) → upsert by name
    const [row] = await db
      .insert(finishesTable)
      .values({
        manufacturerId: mfr.id,
        itemNumber: code,
        name: meta.name,
        imageUrl,
        description: null,
        isActive: true,
        displayOrder: meta.displayOrder,
      })
      .onConflictDoUpdate({
        target: [
          finishesTable.manufacturerId,
          finishesTable.name,
          finishesTable.description,
        ],
        set: {
          itemNumber: code,
          imageUrl,
          displayOrder: meta.displayOrder,
          isActive: true,
        },
      })
      .returning({ id: finishesTable.id });
    codeToFinishId.set(code, row.id);
  }
  console.log(`Upserted ${codeToFinishId.size} finishes`);

  // --- 4. Resolve product SKUs from CSV ---------------------------------
  const wantedSkus = Array.from(new Set(rows.map((r) => r["Product SKU"])));
  const productRows = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, wantedSkus));
  const skuToProductId = new Map(productRows.map((p) => [p.sku, p.id]));
  console.log(
    `Resolved ${skuToProductId.size}/${wantedSkus.length} SKUs to products`,
  );

  // --- 5. Link products → finishes (idempotent) -------------------------
  const links: { productId: number; finishId: number }[] = [];
  const seenPairs = new Set<string>();
  let skippedFinish = 0;
  let skippedProduct = 0;
  for (const r of rows) {
    const code = r["Finish Code"];
    const finishId = codeToFinishId.get(code);
    if (!finishId) {
      if (!OMIT_CODES.has(code)) skippedFinish++;
      continue;
    }
    const productId = skuToProductId.get(r["Product SKU"]);
    if (!productId) {
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
      `(skipped ${skippedFinish} finish-not-seeded, ${skippedProduct} sku-not-found)`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
