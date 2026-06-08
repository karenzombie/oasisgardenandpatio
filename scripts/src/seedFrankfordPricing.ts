import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productFinishOptionsTable,
  productFinishPoolsTable,
  productFabricPoolsTable,
  productFabricOptionsTable,
  fabricsTable,
  finishesTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Frankford pricing / configuration seed
// ---------------------------------------------------------------------------
// Reads the 2026 MSRP + Sale pricing matrix and, per configuration SKU:
//   - upserts per-grade prices into variant_grade_prices (A..F)
//   - sets the variant's display name (Size / Description) and option label
//   - parses the Notes column into structured fields
//       * "Min Order Qty N"               -> min_order_qty
//       * "stripe fabrics not available"  -> exclude_stripe_fabrics (this SKU)
//       * "stripe fabrics not available for X" -> exclude on SKU X
//       * remaining text                  -> notes (inline callout)
// Product-level linkage (idempotent):
//   - Available Finishes "ALL"            -> finish POOL (manufacturer 28)
//   - "SR - Platinum" / "MS - Brushed Silver" -> single finish OPTION
//   - fabric POOL (manufacturer 28) for every Frankford umbrella product
// Finally sets product.msrp/price/salePrice from the default variant's Grade A
// so listing/cart have a sensible "starting at" price.

const MANUFACTURER_ID = 28;
const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/frankford_2026_msrp_and_sale_pricing_1780947395992.csv",
);

const GRADES = ["A", "A+", "B", "C", "D", "E", "F"] as const;

interface PricingRow {
  "Product Name": string;
  Collection: string;
  SKU: string;
  "Size / Description": string;
  "Available Finishes": string;
  Notes: string;
  [key: string]: string;
}

function parseMoney(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

interface ParsedNotes {
  minOrderQty: number | null;
  excludeSelf: boolean;
  excludeTargets: string[];
  calloutText: string | null;
}

function parseNotes(raw: string): ParsedNotes {
  const result: ParsedNotes = {
    minOrderQty: null,
    excludeSelf: false,
    excludeTargets: [],
    calloutText: null,
  };
  if (!raw || !raw.trim()) return result;

  // Split into clauses on ';'
  const clauses = raw
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  const leftover: string[] = [];

  for (const clause of clauses) {
    const lower = clause.toLowerCase();

    const minMatch = lower.match(/min order qty\s*(\d+)/);
    if (minMatch) {
      result.minOrderQty = Number(minMatch[1]);
      continue;
    }

    if (lower.includes("stripe fabrics not available")) {
      const forMatch = clause.match(
        /stripe fabrics not available for\s+([A-Za-z0-9-]+)/i,
      );
      if (forMatch) {
        // Targets another SKU — do not show on this row.
        result.excludeTargets.push(forMatch[1].trim());
      } else {
        result.excludeSelf = true;
      }
      continue;
    }

    leftover.push(clause);
  }

  result.calloutText = leftover.length ? leftover.join("; ") : null;
  return result;
}

async function main() {
  const csv = readFileSync(CSV_PATH, "utf8");
  const { data } = Papa.parse<PricingRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  // Finish lookup by item_number code (SR, MS, ...)
  const finishes = await db
    .select()
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, MANUFACTURER_ID));
  const finishByCode = new Map(finishes.map((f) => [f.itemNumber, f]));

  // Cross-SKU stripe exclusions collected across all rows.
  const excludeStripeFor = new Set<string>();
  // Per-row parsed data we apply after the exclusion set is complete.
  const rowsParsed: Array<{
    row: PricingRow;
    parsed: ParsedNotes;
  }> = [];

  for (const row of data) {
    const sku = (row.SKU || "").trim();
    if (!sku) continue;
    const parsed = parseNotes(row.Notes || "");
    if (parsed.excludeSelf) excludeStripeFor.add(sku);
    for (const t of parsed.excludeTargets) excludeStripeFor.add(t);
    rowsParsed.push({ row, parsed });
  }

  // Track, per product, the default variant Grade A price for product pricing.
  const productDefaultPrice = new Map<
    number,
    { msrp: string | null; sale: string | null; displayOrder: number }
  >();
  // Track product-level finish linkage we still need to write.
  const productFinishPlan = new Map<number, string>(); // productId -> finishes string
  const seenProducts = new Set<number>();

  let variantsUpdated = 0;
  let gradePricesUpserted = 0;
  const missing: string[] = [];

  for (const { row, parsed } of rowsParsed) {
    const sku = (row.SKU || "").trim();
    const variant = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.variantSku, sku))
      .limit(1);
    if (!variant.length) {
      missing.push(sku);
      continue;
    }
    const v = variant[0];
    const productId = v.productId;

    // --- Grade prices ---
    for (const grade of GRADES) {
      const msrp = parseMoney(row[`Grade ${grade} MSRP`]);
      const sale = parseMoney(row[`Grade ${grade} Sale`]);
      if (msrp === null && sale === null) continue;
      // Both columns required to be a valid sellable grade price.
      if (msrp === null || sale === null) continue;
      await db
        .insert(variantGradePricesTable)
        .values({ variantId: v.id, grade, msrp, salePrice: sale })
        .onConflictDoUpdate({
          target: [
            variantGradePricesTable.variantId,
            variantGradePricesTable.grade,
          ],
          set: { msrp, salePrice: sale, updatedAt: new Date() },
        });
      gradePricesUpserted++;
    }

    // --- Variant fields ---
    await db
      .update(productVariantsTable)
      .set({
        variantName: (row["Size / Description"] || v.variantName).trim(),
        optionLabel: "Configuration",
        notes: parsed.calloutText,
        minOrderQty: parsed.minOrderQty,
        excludeStripeFabrics: excludeStripeFor.has(sku),
        updatedAt: new Date(),
      })
      .where(eq(productVariantsTable.id, v.id));
    variantsUpdated++;

    // --- Track product default price from lowest-displayOrder variant ---
    const gradeA = {
      msrp: parseMoney(row["Grade A MSRP"]),
      sale: parseMoney(row["Grade A Sale"]),
    };
    const existing = productDefaultPrice.get(productId);
    if (
      (gradeA.msrp || gradeA.sale) &&
      (!existing || v.displayOrder < existing.displayOrder)
    ) {
      productDefaultPrice.set(productId, {
        msrp: gradeA.msrp,
        sale: gradeA.sale,
        displayOrder: v.displayOrder,
      });
    }

    // --- Product finish plan (first row wins; all rows of a product agree) ---
    if (!productFinishPlan.has(productId)) {
      productFinishPlan.set(productId, (row["Available Finishes"] || "").trim());
    }
    seenProducts.add(productId);
  }

  // --- Eligible fabrics: every active Frankford fabric whose grade is priced
  // (A..F). F+ has no price column in the matrix, so F+ fabrics are not
  // sellable and are excluded. Materialized as product_fabric_options (rather
  // than a pool) so the existing fabric resolver, cart validation, and the
  // composite (product_id, fabric_id) FK on cart_items/order_items all work
  // unchanged. Stripe exclusion is per-variant (excludeStripeFabrics) and is
  // enforced at the application layer, not here.
  const allFabrics = await db
    .select({ id: fabricsTable.id, grade: fabricsTable.grade })
    .from(fabricsTable)
    .where(eq(fabricsTable.manufacturerId, MANUFACTURER_ID));
  const eligibleFabricIds = allFabrics
    .filter((f) => f.grade !== null && GRADES.includes(f.grade as never))
    .map((f) => f.id);

  // --- Product-level finish + fabric linkage ---
  let fabricOptionsInserted = 0;
  for (const productId of seenProducts) {
    const finishSpec = (productFinishPlan.get(productId) || "").trim();

    if (/^all$/i.test(finishSpec)) {
      await db
        .insert(productFinishPoolsTable)
        .values({ productId, manufacturerId: MANUFACTURER_ID })
        .onConflictDoNothing();
    } else if (finishSpec) {
      // e.g. "SR - Platinum" -> code SR
      const code = finishSpec.split("-")[0].trim().toUpperCase();
      const finish = finishByCode.get(code);
      if (finish) {
        await db
          .insert(productFinishOptionsTable)
          .values({ productId, finishId: finish.id })
          .onConflictDoNothing();
      } else {
        console.warn(
          `  ! no finish match for "${finishSpec}" (code ${code}) on product ${productId}`,
        );
      }
    }

    // Remove any stale fabric pool row from an earlier seed run (we now use
    // materialized options instead of a pool for fabrics).
    await db
      .delete(productFabricPoolsTable)
      .where(eq(productFabricPoolsTable.productId, productId));

    // Materialize fabric options in batches.
    for (let i = 0; i < eligibleFabricIds.length; i += 500) {
      const chunk = eligibleFabricIds.slice(i, i + 500);
      await db
        .insert(productFabricOptionsTable)
        .values(chunk.map((fabricId) => ({ productId, fabricId })))
        .onConflictDoNothing();
      fabricOptionsInserted += chunk.length;
    }
  }

  // --- Product pricing defaults ---
  let productsPriced = 0;
  for (const [productId, price] of productDefaultPrice) {
    await db
      .update(productsTable)
      .set({
        msrp: price.msrp ?? undefined,
        price: price.msrp ?? price.sale ?? undefined,
        salePrice: price.sale ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, productId));
    productsPriced++;
  }

  console.log("Frankford pricing seed complete:");
  console.log(`  variants updated:      ${variantsUpdated}`);
  console.log(`  grade prices upserted: ${gradePricesUpserted}`);
  console.log(`  products linked:        ${seenProducts.size}`);
  console.log(`  fabric options:         ${fabricOptionsInserted}`);
  console.log(`  products priced:        ${productsPriced}`);
  console.log(`  stripe-excluded SKUs:   ${[...excludeStripeFor].join(", ")}`);
  if (missing.length) {
    console.log(`  MISSING variants:       ${missing.join(", ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
