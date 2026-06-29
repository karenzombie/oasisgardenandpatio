// Seed the galvanized plate base Stem + Aluminum Top Cover pickers.
//
// Data loaded VERBATIM from the approved spec
// `attached_assets/agent_brief_galvanized_base_pickers_1782759337025.md` and its
// two CSVs (galvanized_base_stem_options / galvanized_base_top_cover_variants).
// Idempotent: safe to re-run.
//
// Creates / maintains:
//   - 7 HIDDEN cover products (24G-TC .. 36G-SQ-TC), cat 39, mfr 28,
//     available_online=false, with the single shared base-plate top-cover image.
//   - product_cover_options: base -> cover product (7 rows, 1:1).
//   - product_cover_finish_prices: 42 rows (7 covers x 6 finishes), tiered
//     WG/HW (higher) vs BK/BZ/WH/CB (lower).
//   - product_stem_options: 16 rows (per-base allowed standalone stems).
import { db } from "@workspace/db";
import {
  productsTable,
  productImagesTable,
  finishesTable,
  productStemOptionsTable,
  productCoverOptionsTable,
  productCoverFinishPricesTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

const MANUFACTURER_ID = 28; // Frankford Umbrellas
const CATEGORY_ID = 39; // Umbrella Bases
const BASE_PLATE_FINISH_ID = 483; // shared top-cover image source

// Finish display order for the cover picker (matches the spec table).
const FINISH_ORDER = ["WG", "HW", "BK", "BZ", "WH", "CB"] as const;
const HI_TIER = new Set(["WG", "HW"]); // Golden Oak / Heather Willow

type BaseDef = {
  baseSku: string;
  shape: "Round" | "Square";
  coverSku: string;
  stems: string[];
  // [msrp, sale] for the WG/HW tier and the BK/BZ/WH/CB tier.
  coverHi: [number, number];
  coverLo: [number, number];
};

const BASES: BaseDef[] = [
  { baseSku: "24G", shape: "Round", coverSku: "24G-TC", stems: ["8ST"], coverHi: [374, 337], coverLo: [206, 186] },
  { baseSku: "30G", shape: "Round", coverSku: "30G-TC", stems: ["8ST", "18ST", "18ST2"], coverHi: [406, 366], coverLo: [228, 206] },
  { baseSku: "36G", shape: "Round", coverSku: "36G-TC", stems: ["8ST", "18ST", "18ST2"], coverHi: [472, 425], coverLo: [258, 233] },
  { baseSku: "40G", shape: "Round", coverSku: "40G-TC", stems: ["8ST", "18ST", "18ST2"], coverHi: [520, 468], coverLo: [320, 288] },
  { baseSku: "20G-SQ", shape: "Square", coverSku: "20G-SQ-TC", stems: ["8ST"], coverHi: [406, 366], coverLo: [228, 206] },
  { baseSku: "24G-SQ", shape: "Square", coverSku: "24G-SQ-TC", stems: ["8ST", "18ST"], coverHi: [472, 425], coverLo: [258, 233] },
  { baseSku: "36G-SQ", shape: "Square", coverSku: "36G-SQ-TC", stems: ["8ST", "18ST", "18ST2"], coverHi: [520, 468], coverLo: [320, 288] },
];

function coverSlug(coverSku: string): string {
  return `${coverSku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-aluminum-top-cover-frankford`;
}

async function main() {
  // ---- Resolve shared references ---------------------------------------
  const [basePlate] = await db
    .select({ url: finishesTable.imageUrl })
    .from(finishesTable)
    .where(eq(finishesTable.id, BASE_PLATE_FINISH_ID))
    .limit(1);
  if (!basePlate?.url) {
    throw new Error(`Base-plate cover image (finish ${BASE_PLATE_FINISH_ID}) not found`);
  }
  const coverImageUrl = basePlate.url;

  // Cover finishes by item_number (within Frankford).
  const finishRows = await db
    .select({ id: finishesTable.id, code: finishesTable.itemNumber, name: finishesTable.name })
    .from(finishesTable)
    .where(
      and(
        eq(finishesTable.manufacturerId, MANUFACTURER_ID),
        inArray(finishesTable.itemNumber, [...FINISH_ORDER]),
      ),
    );
  const finishByCode = new Map(finishRows.map((f) => [f.code!, f]));
  for (const code of FINISH_ORDER) {
    if (!finishByCode.has(code)) throw new Error(`Finish code ${code} (mfr ${MANUFACTURER_ID}) not found`);
  }

  // Base + stem products by sku (within Frankford).
  const baseSkus = BASES.map((b) => b.baseSku);
  const stemSkus = Array.from(new Set(BASES.flatMap((b) => b.stems)));
  const productRows = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.manufacturerId, MANUFACTURER_ID),
        inArray(productsTable.sku, [...baseSkus, ...stemSkus]),
      ),
    );
  const productIdBySku = new Map(productRows.map((p) => [p.sku, p.id]));
  for (const sku of [...baseSkus, ...stemSkus]) {
    if (!productIdBySku.has(sku)) throw new Error(`Product sku "${sku}" (mfr ${MANUFACTURER_ID}) not found`);
  }

  let coverProducts = 0;
  let coverOptions = 0;
  let finishPrices = 0;
  let stemOptions = 0;

  for (const b of BASES) {
    const baseProductId = productIdBySku.get(b.baseSku)!;

    // 1) Hidden cover product (upsert by globally-unique sku).
    const coverName = `${b.shape} Aluminum Top Cover`;
    const [coverRow] = await db
      .insert(productsTable)
      .values({
        name: coverName,
        slug: coverSlug(b.coverSku),
        sku: b.coverSku,
        description:
          "Aluminum top cover accessory for the galvanized plate base. Price varies by finish color. Sold only as an add-on to its base.",
        manufacturerId: MANUFACTURER_ID,
        categoryId: CATEGORY_ID,
        pricingMode: "fixed",
        showPriceOnline: false,
        availableOnline: false,
        inStoreOnly: false,
        isActive: true,
        quoteOnly: false,
      })
      .onConflictDoUpdate({
        target: productsTable.sku,
        set: {
          name: coverName,
          manufacturerId: MANUFACTURER_ID,
          categoryId: CATEGORY_ID,
          pricingMode: "fixed",
          showPriceOnline: false,
          availableOnline: false,
          isActive: true,
        },
      })
      .returning({ id: productsTable.id });
    const coverProductId = coverRow!.id;
    coverProducts++;

    // 2) Shared base-plate image as the cover's single primary image. Managed
    //    exclusively here, so delete+reinsert keeps it idempotent.
    await db.delete(productImagesTable).where(eq(productImagesTable.productId, coverProductId));
    await db.insert(productImagesTable).values({
      productId: coverProductId,
      url: coverImageUrl,
      altText: `${coverName} finish colors`,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    });

    // 3) base -> cover mapping (1:1, base_product_id unique).
    await db
      .insert(productCoverOptionsTable)
      .values({ baseProductId, coverProductId })
      .onConflictDoUpdate({
        target: productCoverOptionsTable.baseProductId,
        set: { coverProductId },
      });
    coverOptions++;

    // 4) per-finish prices.
    for (let i = 0; i < FINISH_ORDER.length; i++) {
      const code = FINISH_ORDER[i]!;
      const finish = finishByCode.get(code)!;
      const [msrp, sale] = HI_TIER.has(code) ? b.coverHi : b.coverLo;
      await db
        .insert(productCoverFinishPricesTable)
        .values({
          coverProductId,
          finishId: finish.id,
          msrp: String(msrp),
          salePrice: String(sale),
          displayOrder: i,
        })
        .onConflictDoUpdate({
          target: [
            productCoverFinishPricesTable.coverProductId,
            productCoverFinishPricesTable.finishId,
          ],
          set: { msrp: String(msrp), salePrice: String(sale), displayOrder: i },
        });
      finishPrices++;
    }

    // 5) per-base allowed stems.
    for (let i = 0; i < b.stems.length; i++) {
      const stemProductId = productIdBySku.get(b.stems[i]!)!;
      await db
        .insert(productStemOptionsTable)
        .values({ baseProductId, stemProductId, displayOrder: i })
        .onConflictDoUpdate({
          target: [
            productStemOptionsTable.baseProductId,
            productStemOptionsTable.stemProductId,
          ],
          set: { displayOrder: i },
        });
      stemOptions++;
    }

    console.log(
      `Base ${b.baseSku}: cover ${b.coverSku} (id=${coverProductId}), 6 finish prices, ${b.stems.length} stems`,
    );
  }

  console.log(
    `Done. coverProducts=${coverProducts} coverOptions=${coverOptions} finishPrices=${finishPrices} stemOptions=${stemOptions}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
