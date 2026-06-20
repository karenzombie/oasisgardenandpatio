/**
 * exportProducts.ts
 *
 * On-demand data dump: one CSV per manufacturer, written to `exports/` in the
 * project root and named `<manufacturer-slug>-products.csv`. Products with no
 * manufacturer go to `no-manufacturer-products.csv`.
 *
 * Behaviour (per the agreed spec):
 *   - Every product field is included; NULL/empty values are preserved as
 *     blank cells so you can see exactly what is and isn't populated.
 *   - Array / JSON fields (specs, tags, variants, fabric/finish options &
 *     pools, images, attributes) are serialized as JSON strings in the cell.
 *   - Fabric/finish POOLS are recorded as references only (the manufacturer
 *     whose full catalog is offered), not expanded into every fabric/finish.
 *   - Image/swatch URLs stored as internal `/objects/...` paths are rewritten
 *     to fully-qualified, clickable URLs using the app domain.
 *   - Inventory/stock levels are intentionally excluded.
 *
 * Run from the Replit Shell:
 *   pnpm --filter @workspace/scripts run export-products
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Papa from "papaparse";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const EXPORTS_DIR = join(WORKSPACE_ROOT, "exports");

// ---------------------------------------------------------------------------
// Public base URL for rewriting internal /objects/... image paths.
// Prefers the published domain, falls back to the dev domain. Override with
// PUBLIC_BASE_URL if you want the CSVs to point somewhere specific.
// ---------------------------------------------------------------------------
function resolveBaseUrl(): string {
  const raw =
    process.env.PUBLIC_BASE_URL ||
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN ||
    "";
  if (!raw) return "";
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "");
}

const BASE_URL = resolveBaseUrl();

// Recursively rewrite any string that looks like an internal object-storage
// path (`/objects/...`) into a fully-qualified URL served by the storage proxy
// at `/api/storage/objects/...`. Walks nested objects/arrays so it catches
// image URLs wherever they appear (images[].url, fabric swatch URLs, etc.).
function rewriteImagePaths(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("/objects/")) {
      return BASE_URL ? `${BASE_URL}/api/storage${value}` : `/api/storage${value}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(rewriteImagePaths);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteImagePaths(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Column layout. JSON_FIELDS are serialized with JSON.stringify; everything
// else is emitted as a plain value (NULL -> blank cell).
// ---------------------------------------------------------------------------
const COLUMNS = [
  "manufacturer",
  "manufacturer_slug",
  "product_id",
  "sku",
  "name",
  "slug",
  "description",
  "short_description",
  "category",
  "category_slug",
  "material",
  "material_slug",
  "price",
  "sale_price",
  "frame_only_price",
  "cost",
  "msrp",
  "markup_percent",
  "pricing_mode",
  "weight",
  "dimensions",
  "specs",
  "tags",
  "show_price_online",
  "available_online",
  "in_store_only",
  "quote_only",
  "featured",
  "featured_at",
  "display_order",
  "low_stock_threshold",
  "is_active",
  "created_at",
  "updated_at",
  "variants",
  "fabric_options",
  "fabric_pools",
  "finish_options",
  "finish_pools",
  "images",
  "attributes",
] as const;

const JSON_FIELDS = new Set([
  "specs",
  "tags",
  "variants",
  "fabric_options",
  "fabric_pools",
  "finish_options",
  "finish_pools",
  "images",
  "attributes",
]);

// ---------------------------------------------------------------------------
// One query returns every product with all related data pre-aggregated as
// JSON. Aggregates COALESCE to '[]' so "no related rows" is distinguishable
// from a genuinely NULL scalar (which stays blank).
// ---------------------------------------------------------------------------
const QUERY = `
  SELECT
    m.name  AS manufacturer,
    m.slug  AS manufacturer_slug,
    p.id    AS product_id,
    p.sku,
    p.name,
    p.slug,
    p.description,
    p.short_description,
    c.name   AS category,
    c.slug   AS category_slug,
    mat.name AS material,
    mat.slug AS material_slug,
    p.price,
    p.sale_price,
    p.frame_only_price,
    p.cost,
    p.msrp,
    p.markup_percent,
    p.pricing_mode,
    p.weight,
    p.dimensions,
    p.specs,
    p.tags,
    p.show_price_online,
    p.available_online,
    p.in_store_only,
    p.quote_only,
    p.featured,
    p.featured_at,
    p.display_order,
    p.low_stock_threshold,
    p.is_active,
    p.created_at,
    p.updated_at,
    (SELECT COALESCE(json_agg(json_build_object(
        'variant_sku', v.variant_sku,
        'variant_name', v.variant_name,
        'option_label', v.option_label,
        'price_adjustment', v.price_adjustment,
        'msrp', v.msrp,
        'sale_price', v.sale_price,
        'shipping_surcharge', v.shipping_surcharge,
        'weight', v.weight,
        'notes', v.notes,
        'min_order_qty', v.min_order_qty,
        'exclude_stripe_fabrics', v.exclude_stripe_fabrics,
        'display_order', v.display_order,
        'is_active', v.is_active,
        'grade_prices', (
          SELECT COALESCE(json_agg(json_build_object(
            'grade', g.grade, 'msrp', g.msrp, 'sale_price', g.sale_price
          ) ORDER BY g.grade), '[]'::json)
          FROM variant_grade_prices g WHERE g.variant_id = v.id
        )
      ) ORDER BY v.display_order, v.id), '[]'::json)
      FROM product_variants v WHERE v.product_id = p.id
    ) AS variants,
    (SELECT COALESCE(json_agg(json_build_object(
        'fabric_id', f.id,
        'item_number', f.item_number,
        'name', f.name,
        'grade', f.grade,
        'color_family', f.color_family,
        'is_stripe', f.is_stripe,
        'swatch_image_url', f.swatch_image_url,
        'display_order', pfo.display_order
      ) ORDER BY pfo.display_order, f.name), '[]'::json)
      FROM product_fabric_options pfo
      JOIN fabrics f ON f.id = pfo.fabric_id
      WHERE pfo.product_id = p.id
    ) AS fabric_options,
    (SELECT COALESCE(json_agg(json_build_object(
        'manufacturer_id', fm.id,
        'manufacturer', fm.name,
        'manufacturer_slug', fm.slug
      ) ORDER BY fm.name), '[]'::json)
      FROM product_fabric_pools pfp
      JOIN manufacturers fm ON fm.id = pfp.manufacturer_id
      WHERE pfp.product_id = p.id
    ) AS fabric_pools,
    (SELECT COALESCE(json_agg(json_build_object(
        'finish_id', fi.id,
        'item_number', fi.item_number,
        'name', fi.name,
        'description', fi.description,
        'collection', fi.collection,
        'image_url', fi.image_url,
        'display_order', pfio.display_order
      ) ORDER BY pfio.display_order, fi.name), '[]'::json)
      FROM product_finish_options pfio
      JOIN finishes fi ON fi.id = pfio.finish_id
      WHERE pfio.product_id = p.id
    ) AS finish_options,
    (SELECT COALESCE(json_agg(json_build_object(
        'manufacturer_id', fnm.id,
        'manufacturer', fnm.name,
        'manufacturer_slug', fnm.slug
      ) ORDER BY fnm.name), '[]'::json)
      FROM product_finish_pools pfnp
      JOIN manufacturers fnm ON fnm.id = pfnp.manufacturer_id
      WHERE pfnp.product_id = p.id
    ) AS finish_pools,
    (SELECT COALESCE(json_agg(json_build_object(
        'url', pi.url,
        'alt_text', pi.alt_text,
        'is_primary', pi.is_primary,
        'display_order', pi.display_order,
        'image_kind', pi.image_kind,
        'variant_id', pi.variant_id
      ) ORDER BY pi.display_order, pi.id), '[]'::json)
      FROM product_images pi WHERE pi.product_id = p.id
    ) AS images,
    (SELECT COALESCE(json_agg(json_build_object(
        'attribute_type', pa.attribute_type,
        'part_name', pa.part_name,
        'value', pa.value,
        'display_order', pa.display_order
      ) ORDER BY pa.display_order, pa.id), '[]'::json)
      FROM product_attributes pa WHERE pa.product_id = p.id
    ) AS attributes
  FROM products p
  LEFT JOIN manufacturers m   ON m.id = p.manufacturer_id
  LEFT JOIN categories c      ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT
      string_agg(m2.name, ', ' ORDER BY pm.display_order, m2.name) AS name,
      string_agg(m2.slug, ', ' ORDER BY pm.display_order, m2.name) AS slug
    FROM product_materials pm
    JOIN materials m2 ON m2.id = pm.material_id
    WHERE pm.product_id = p.id
  ) mat ON true
  ORDER BY m.slug NULLS LAST, p.sku
`;

type Row = Record<string, unknown>;

function toCell(col: string, value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return "";
  if (JSON_FIELDS.has(col)) {
    return JSON.stringify(rewriteImagePaths(value));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  return String(value);
}

async function main() {
  console.log("=== exportProducts ===\n");
  if (!BASE_URL) {
    console.warn(
      "⚠ No PUBLIC_BASE_URL / REPLIT_DOMAINS / REPLIT_DEV_DOMAIN found — " +
        "image URLs will be written as /api/storage/... relative paths.\n",
    );
  } else {
    console.log(`Image URLs will be prefixed with: ${BASE_URL}\n`);
  }

  const result = await db.execute(sql.raw(QUERY));
  // node-postgres driver returns { rows }, but guard for either shape.
  const rows: Row[] = (
    Array.isArray(result) ? result : (result as { rows: Row[] }).rows
  ) as Row[];

  console.log(`Fetched ${rows.length} products.\n`);

  // Group by manufacturer slug (NULL -> no-manufacturer).
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const slug = (row.manufacturer_slug as string | null) ?? "no-manufacturer";
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug)!.push(row);
  }

  await mkdir(EXPORTS_DIR, { recursive: true });

  const summary: { file: string; products: number }[] = [];
  for (const [slug, groupRows] of [...groups.entries()].sort()) {
    const data = groupRows.map((r) => COLUMNS.map((col) => toCell(col, r[col])));
    const csv = Papa.unparse({ fields: [...COLUMNS], data });
    const filename = `${slug}-products.csv`;
    await writeFile(join(EXPORTS_DIR, filename), csv, "utf8");
    summary.push({ file: filename, products: groupRows.length });
  }

  console.log("=== Wrote files to exports/ ===");
  for (const s of summary) {
    console.log(`  ${s.file.padEnd(40)} ${s.products} product(s)`);
  }
  console.log(
    `\nDone. ${summary.length} file(s), ${rows.length} product(s) total.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
