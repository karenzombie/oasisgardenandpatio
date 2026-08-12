import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type StartingPriceInfo = {
  priceVaries: boolean;
  startingPrice: string | null;
  startingSalePrice: string | null;
};

/**
 * Computes, for each given product, the lowest possible configuration price and
 * whether the product has customer-selectable options that change the price.
 *
 * A configuration's price follows the same rules the PDP/cart use:
 *  - Grade mode: variant has rows in variant_grade_prices keyed by (variant_id, grade).
 *    Per row, msrp/salePrice; effective = salePrice when > 0 else msrp.
 *  - Absolute variant: variant.msrp is set (and no grade prices) -> overrides base.
 *  - Base + adjustment: variant.msrp null (and no grade prices) -> product base price
 *    (sale_price when present, else price) + variant.price_adjustment.
 *
 * Frame-only pricing is intentionally excluded: it represents buying the bare
 * frame without a fabric and is not a normal configuration, so it should not
 * drive the advertised "Starting at" price.
 *
 * priceVaries is true when the product has more than one distinct effective
 * configuration price. startingPrice/startingSalePrice describe the cheapest
 * configuration (by effective price); startingSalePrice is null when that
 * configuration is not on sale.
 */
export async function computeStartingPrices(
  productIds: number[],
): Promise<Map<number, StartingPriceInfo>> {
  const result = new Map<number, StartingPriceInfo>();
  if (productIds.length === 0) return result;

  const ids = sql.join(
    productIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const rows = await db.execute<{
    product_id: number;
    distinct_eff: number;
    msrp: string | null;
    sale_price: string | null;
  }>(sql`
    WITH candidates AS (
      -- Grade mode
      SELECT v.product_id AS product_id,
             vgp.msrp::text AS msrp,
             NULLIF(vgp.sale_price, 0)::text AS sale_price,
             (CASE WHEN vgp.sale_price > 0 THEN vgp.sale_price ELSE vgp.msrp END) AS eff
      FROM product_variants v
      JOIN variant_grade_prices vgp ON vgp.variant_id = v.id
      WHERE v.is_active = true AND v.product_id IN (${ids})

      UNION ALL

      -- Absolute per-variant pricing (no grade prices)
      SELECT v.product_id AS product_id,
             v.msrp::text AS msrp,
             NULLIF(v.sale_price, 0)::text AS sale_price,
             (CASE WHEN v.sale_price > 0 THEN v.sale_price ELSE v.msrp END) AS eff
      FROM product_variants v
      WHERE v.is_active = true
        AND v.msrp IS NOT NULL
        AND v.product_id IN (${ids})
        AND NOT EXISTS (
          SELECT 1 FROM variant_grade_prices g WHERE g.variant_id = v.id
        )

      UNION ALL

      -- Base price + per-variant adjustment (no grade prices, no absolute variant price)
      SELECT v.product_id AS product_id,
             (p.msrp + v.price_adjustment)::text AS msrp,
             (CASE WHEN p.sale_price > 0
                   THEN (p.sale_price + v.price_adjustment) END)::text AS sale_price,
             ((CASE WHEN p.sale_price > 0 THEN p.sale_price ELSE p.msrp END)
               + v.price_adjustment) AS eff
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.is_active = true
        AND v.msrp IS NULL
        AND p.msrp IS NOT NULL
        AND v.product_id IN (${ids})
        AND NOT EXISTS (
          SELECT 1 FROM variant_grade_prices g WHERE g.variant_id = v.id
        )
    ),
    agg AS (
      SELECT product_id, COUNT(DISTINCT eff) AS distinct_eff
      FROM candidates
      GROUP BY product_id
    ),
    lowest AS (
      SELECT DISTINCT ON (product_id) product_id, msrp, sale_price
      FROM candidates
      ORDER BY product_id, eff ASC, msrp ASC
    )
    SELECT a.product_id AS product_id,
           a.distinct_eff::int AS distinct_eff,
           l.msrp AS msrp,
           l.sale_price AS sale_price
    FROM agg a
    JOIN lowest l ON l.product_id = a.product_id
  `);

  for (const r of rows.rows) {
    const varies = Number(r.distinct_eff) > 1;
    result.set(Number(r.product_id), {
      priceVaries: varies,
      startingPrice: varies ? r.msrp : null,
      startingSalePrice: varies ? r.sale_price : null,
    });
  }
  return result;
}
