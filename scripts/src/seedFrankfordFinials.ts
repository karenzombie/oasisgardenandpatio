import { db } from "@workspace/db";
import { productsTable, productFinialOptionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Seed Frankford umbrella finial options (idempotent).
//
// Finials are a customer-selectable umbrella pole-cap option on a handful of
// Frankford series products. Each series product owns its own short list of
// finial choices (all size variants of the product inherit the same list).
// Pricing rule: sale upcharge = ceil(msrp upcharge * 0.90).
// ---------------------------------------------------------------------------

type Opt = {
  code: string;
  name: string;
  isDefault?: boolean;
  upchargeMsrp?: number;
  displayOrder: number;
};

const ceilSale = (msrp: number) => Math.ceil(msrp * 0.9);

// Group 1 / Group 3 share the same option set: Chrome Vertex is the default.
const CHROME_VERTEX_DEFAULT: Opt[] = [
  { code: "VF", name: "Chrome Vertex", isDefault: true, displayOrder: 0 },
  { code: "BF", name: "Chrome Ball", displayOrder: 1 },
  { code: "SS-VF", name: "SS Vertex", upchargeMsrp: 30, displayOrder: 2 },
  { code: "SS-BF", name: "SS Ball", upchargeMsrp: 30, displayOrder: 3 },
];

// Group 2: Chrome Ball is the default.
const CHROME_BALL_DEFAULT: Opt[] = [
  { code: "BF", name: "Chrome Ball", isDefault: true, displayOrder: 0 },
  { code: "VF", name: "Chrome Vertex", displayOrder: 1 },
  { code: "SS-VF", name: "SS Vertex", upchargeMsrp: 30, displayOrder: 2 },
  { code: "SS-BF", name: "SS Ball", upchargeMsrp: 30, displayOrder: 3 },
];

// Group 4 (Monterey Fiberglass, all lift types): TPU options, both free,
// customer must choose. TPU Classic Ball is the default.
const TPU_OPTIONS: Opt[] = [
  { code: "BF", name: "TPU Classic Ball", isDefault: true, displayOrder: 0 },
  { code: "VF", name: "TPU Vertex", displayOrder: 1 },
];

// Map: product SKU → finial option set.
const PRODUCT_FINIALS: Record<string, Opt[]> = {
  "880CAM": CHROME_VERTEX_DEFAULT, // Group 1: Greenwich Giant
  "880FM": CHROME_BALL_DEFAULT, // Group 2: Monterey Giant
  "845CAM": CHROME_VERTEX_DEFAULT, // Group 3: Greenwich Aluminum
  "845FM": TPU_OPTIONS, // Group 4: Monterey Fiberglass (Pulley)
  "845FMA": TPU_OPTIONS, // Group 4: Monterey Fiberglass (Crank/Auto Tilt)
  "845FMC": TPU_OPTIONS, // Group 4: Monterey Fiberglass (Crank/No Tilt)
};

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const [sku, opts] of Object.entries(PRODUCT_FINIALS)) {
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (!product) {
      console.warn(`SKIP: product SKU ${sku} not found`);
      continue;
    }

    for (const o of opts) {
      const msrp = o.upchargeMsrp ?? 0;
      const sale = msrp > 0 ? ceilSale(msrp) : 0;
      const res = await db
        .insert(productFinialOptionsTable)
        .values({
          productId: product.id,
          code: o.code,
          name: o.name,
          isDefault: o.isDefault ?? false,
          upchargeMsrp: msrp.toFixed(2),
          upchargeSale: sale.toFixed(2),
          displayOrder: o.displayOrder,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [
            productFinialOptionsTable.productId,
            productFinialOptionsTable.code,
          ],
          set: {
            name: o.name,
            isDefault: o.isDefault ?? false,
            upchargeMsrp: msrp.toFixed(2),
            upchargeSale: sale.toFixed(2),
            displayOrder: o.displayOrder,
            isActive: true,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: productFinialOptionsTable.id });
      if (res.length) {
        // crude insert vs update detection not available; count all as upserts
        updated += 1;
      }
    }
    console.log(`${sku} (product ${product.id}): ${opts.length} finial options`);
  }

  console.log(`Done. Upserted ${updated} finial option rows.`);
  void inserted;
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
