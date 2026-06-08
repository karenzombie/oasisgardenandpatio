/**
 * Comprehensive repair: populate the Features tab for all manufacturers
 * by restructuring products.description as:
 *
 *   <short_description (existing top blurb)>
 *
 *   <features as HTML>
 *
 * CSV feature data goes into the Features tab only — no duplication
 * with the top blurb.
 *
 * Manufacturers covered:
 *  - Couture Jardin     (271) pipe-separated description
 *  - Galtech            ( 35) pipe-separated specs, model_number → GT-XXX
 *  - Hanamint           (268) sentence Description
 *  - Homecrest          (514) paragraph Description, multi-SKU rows
 *  - NorthCape          (167) paragraph Description + pipe Features
 *  - Summerset          (330) scraped description with Specifications block
 *  - Tropitone          (113) full paragraph description (separate CSV)
 *  - Shoreline          ( 40) raw_description, keyed by product name
 *  - Sunset West        (357) Notes field (51 products)
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/fixAllProductFeatures.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, ilike, inArray } from "drizzle-orm";
import { db, productsTable, manufacturersTable } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "../../attached_assets");

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvFile(filename: string): Record<string, string>[] {
  const p = path.join(ASSETS, filename);
  if (!fs.existsSync(p)) {
    console.warn(`  WARN: CSV not found: ${filename}`);
    return [];
  }
  const text = fs.readFileSync(p, "utf-8");
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0] ?? "");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
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
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/** Convert pipe-separated or semicolon-separated text to <ul> bullets */
function pipesToHtml(raw: string, sep = "|"): string {
  const bullets = raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bullets.length === 0) return "";
  return `<ul>\n${bullets.map((b) => `  <li>${b}</li>`).join("\n")}\n</ul>`;
}

/** Wrap a plain paragraph in a <p> tag */
function paraToHtml(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return `<p>${t}</p>`;
}

/** Build the new description: preserve existing top blurb, append features HTML */
function buildDescription(shortDesc: string | null, featuresHtml: string): string {
  const blurb = (shortDesc ?? "").trim();
  if (!featuresHtml) return blurb;
  return blurb ? `${blurb}\n\n${featuresHtml}` : featuresHtml;
}

// ─── Per-manufacturer feature maps ───────────────────────────────────────────

function buildCoutureJardinMap(): Map<string, string> {
  const rows = parseCsvFile("couture_jardin_products_1780107087804.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const sku = r["sku"] ?? "";
    const desc = r["description"] ?? "";
    if (sku && desc) map.set(sku, pipesToHtml(desc));
  }
  console.log(`  Couture Jardin CSV: ${map.size} entries`);
  return map;
}

function buildGaltechMap(): Map<string, string> {
  const rows = parseCsvFile("galtech_products_1780285430825.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const model = (r["model_number"] ?? "").trim();
    const specs = r["specs"] ?? "";
    // DB SKUs are GT-XXX where XXX = model_number
    if (model && specs) {
      map.set(`GT-${model}`, pipesToHtml(specs));
    }
  }
  console.log(`  Galtech CSV: ${map.size} entries`);
  return map;
}

function buildHanamintMap(): Map<string, string> {
  const rows = parseCsvFile("hanamint_products_clean_1780113404627.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const sku = r["SKU"] ?? "";
    const desc = r["Description"] ?? "";
    if (sku && desc) map.set(sku, paraToHtml(desc));
  }
  console.log(`  Hanamint CSV: ${map.size} entries`);
  return map;
}

/** Homecrest rows may have "SKU1; SKU2" — expand to one entry per SKU */
function buildHomecrestMap(): Map<string, string> {
  const rows = parseCsvFile("homecrest_products_1780295516945.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const skuField = r["Product SKU(s)"] ?? "";
    const desc = r["Description"] ?? "";
    if (!desc) continue;
    const html = paraToHtml(desc);
    for (const raw of skuField.split(";")) {
      const sku = raw.trim();
      if (sku) map.set(sku, html);
    }
  }
  console.log(`  Homecrest CSV: ${map.size} entries (expanded multi-SKU rows)`);
  return map;
}

/**
 * NorthCape has both Description (marketing paragraph) and Features (pipe list).
 * We build: <description paragraph> + <ul bullets from Features>
 * If only one exists, use what we have.
 */
function buildNorthCapeMap(): Map<string, string> {
  const rows = parseCsvFile("northcape_products_clean_1780183547311.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const sku = r["SKU"] ?? "";
    const desc = (r["Description"] ?? "").trim();
    const feats = (r["Features"] ?? "").trim();
    if (!sku) continue;
    const parts: string[] = [];
    if (desc) parts.push(paraToHtml(desc));
    if (feats) parts.push(pipesToHtml(feats));
    if (parts.length > 0) map.set(sku, parts.join("\n\n"));
  }
  console.log(`  NorthCape CSV: ${map.size} entries`);
  return map;
}

/**
 * Summerset descriptions are scraped strings like:
 * "Description <name> Dimensions & Weight Product Dimension W ... Specifications Color X Frame Type Y ..."
 * We extract the Specifications block and format as key-value bullets.
 */
function buildSummersetMap(): Map<string, string> {
  const rows = parseCsvFile("summerset_products_1780109395654.csv");
  const map = new Map<string, string>();

  for (const r of rows) {
    // Summerset SKUs may have trailing " - B" etc — normalize to match DB
    const rawSku = (r["sku"] ?? "").trim();
    const desc = r["description"] ?? "";

    if (!rawSku || !desc) continue;

    let featuresHtml = "";

    if (desc.includes("Specifications")) {
      let spec = desc.split("Specifications")[1] ?? "";
      // Strip boilerplate at the end
      spec = spec
        .split("California")[0]
        .split("Additional Documents")[0]
        .trim();

      if (spec) {
        // The spec block is a run-on string of "Key Value Key Value"
        // Common keys: Color, Frame Type, Cushion Info, Matching Cover, Warranty, QTY/CTN
        // Split on known key markers to make bullets
        const knownKeys = [
          "Color",
          "Frame Type",
          "Cushion Info",
          "Matching Cover",
          "Warranty",
          "QTY/CTN",
          "Qty/Ctn",
          "Cushion Purchase Separately",
        ];
        // Build bullets by splitting at key boundaries
        const bullets: string[] = [];
        let remaining = spec.trim();
        let lastKey = "";
        let lastStart = -1;

        for (let i = 0; i < remaining.length; i++) {
          for (const key of knownKeys) {
            if (remaining.startsWith(key, i)) {
              if (lastKey && lastStart >= 0) {
                const val = remaining.slice(lastStart + lastKey.length, i).trim();
                if (val) bullets.push(`${lastKey}: ${val}`);
              }
              lastKey = key;
              lastStart = i;
              break;
            }
          }
        }
        // Capture last key
        if (lastKey && lastStart >= 0) {
          const val = remaining.slice(lastStart + lastKey.length).trim();
          if (val) bullets.push(`${lastKey}: ${val}`);
        }

        if (bullets.length > 0) {
          featuresHtml = `<ul>\n${bullets.map((b) => `  <li>${b}</li>`).join("\n")}\n</ul>`;
        } else if (spec.length > 0 && spec.length < 500) {
          // Fallback: just wrap as a paragraph
          featuresHtml = paraToHtml(spec);
        }
      }
    }

    if (featuresHtml) map.set(rawSku, featuresHtml);
  }
  console.log(`  Summerset CSV: ${map.size} entries with parseable specs`);
  return map;
}

function buildTropitoneMap(): Map<string, string> {
  const rows = parseCsvFile("tropitone_descriptions_1780427603953.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const sku = r["sku"] ?? "";
    const desc = r["description"] ?? "";
    if (sku && desc) map.set(sku, paraToHtml(desc));
  }
  console.log(`  Tropitone CSV: ${map.size} entries`);
  return map;
}

/** Shoreline has no SKU — match by product name (case-insensitive) */
function buildShorelineMap(): Map<string, string> {
  const rows = parseCsvFile("shoreline_products_clean_1780350601832.csv");
  const map = new Map<string, string>(); // keyed by lowercase product name
  for (const r of rows) {
    const name = (r["product_name"] ?? "").trim().toLowerCase();
    const rawDesc = (r["raw_description"] ?? "").trim();
    if (!name) continue;

    const parts: string[] = [];
    if (rawDesc) parts.push(paraToHtml(rawDesc));

    if (parts.length > 0) map.set(name, parts.join("\n\n"));
  }
  console.log(`  Shoreline CSV: ${map.size} entries`);
  return map;
}

/** Sunset West — only 51/357 have Notes */
function buildSunsetWestMap(): Map<string, string> {
  const rows = parseCsvFile("Sunset_West_2026_Product_Listing_1780345346210.csv");
  const map = new Map<string, string>();
  for (const r of rows) {
    const sku = r["SKU"] ?? "";
    const notes = (r["Notes"] ?? "").trim();
    if (sku && notes) map.set(sku, paraToHtml(notes));
  }
  console.log(`  Sunset West CSV: ${map.size} entries with Notes`);
  return map;
}

// ─── Per-manufacturer DB updater ──────────────────────────────────────────────

type Product = {
  id: number;
  sku: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
};

async function loadProducts(mfrNamePattern: string): Promise<Product[]> {
  return db
    .select({
      id: productsTable.id,
      sku: productsTable.sku,
      name: productsTable.name,
      shortDescription: productsTable.shortDescription,
      description: productsTable.description,
    })
    .from(productsTable)
    .innerJoin(
      manufacturersTable,
      eq(productsTable.manufacturerId, manufacturersTable.id)
    )
    .where(ilike(manufacturersTable.name, `%${mfrNamePattern}%`));
}

async function applyMap(
  mfrLabel: string,
  products: Product[],
  featuresMap: Map<string, string>,
  keyFn: (p: Product) => string = (p) => p.sku
): Promise<{ updated: number; skipped: number; noData: number }> {
  let updated = 0;
  let skipped = 0;
  let noData = 0;

  for (const product of products) {
    const key = keyFn(product);
    const featuresHtml = featuresMap.get(key);

    if (!featuresHtml) {
      noData++;
      continue;
    }

    const newDesc = buildDescription(product.shortDescription, featuresHtml);

    if (product.description === newDesc) {
      skipped++;
      continue;
    }

    await db
      .update(productsTable)
      .set({ description: newDesc })
      .where(eq(productsTable.id, product.id));

    console.log(`    OK  ${mfrLabel} ${key}`);
    updated++;
  }

  return { updated, skipped, noData };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const results: Array<{ mfr: string; updated: number; skipped: number; noData: number }> = [];

  // ── Couture Jardin ──
  {
    console.log("\nCouture Jardin…");
    const map = buildCoutureJardinMap();
    const products = await loadProducts("couture");
    const r = await applyMap("CJ", products, map);
    results.push({ mfr: "Couture Jardin", ...r });
  }

  // ── Galtech ──
  {
    console.log("\nGaltech…");
    const map = buildGaltechMap();
    const products = await loadProducts("galtech");
    const r = await applyMap("GA", products, map);
    results.push({ mfr: "Galtech", ...r });
  }

  // ── Hanamint ──
  {
    console.log("\nHanamint…");
    const map = buildHanamintMap();
    const products = await loadProducts("hanamint");
    const r = await applyMap("HN", products, map);
    results.push({ mfr: "Hanamint", ...r });
  }

  // ── Homecrest ──
  {
    console.log("\nHomecrest…");
    const map = buildHomecrestMap();
    const products = await loadProducts("homecrest");
    const r = await applyMap("HC", products, map);
    results.push({ mfr: "Homecrest", ...r });
  }

  // ── NorthCape ──
  {
    console.log("\nNorthCape…");
    const map = buildNorthCapeMap();
    const products = await loadProducts("northcape");
    const r = await applyMap("NC", products, map);
    results.push({ mfr: "NorthCape", ...r });
  }

  // ── Summerset ──
  {
    console.log("\nSummerset…");
    const map = buildSummersetMap();
    const products = await loadProducts("summerset");
    const r = await applyMap("SS", products, map);
    results.push({ mfr: "Summerset", ...r });
  }

  // ── Tropitone ──
  {
    console.log("\nTropitone…");
    const map = buildTropitoneMap();
    const products = await loadProducts("tropitone");
    const r = await applyMap("TP", products, map);
    results.push({ mfr: "Tropitone", ...r });
  }

  // ── Shoreline (keyed by lowercase product name) ──
  {
    console.log("\nShoreline…");
    const map = buildShorelineMap();
    const products = await loadProducts("shoreline");
    const r = await applyMap(
      "SL",
      products,
      map,
      (p) => p.name.toLowerCase()
    );
    results.push({ mfr: "Shoreline", ...r });
  }

  // ── Sunset West ──
  {
    console.log("\nSunset West…");
    const map = buildSunsetWestMap();
    const products = await loadProducts("sunset");
    const r = await applyMap("SW", products, map);
    results.push({ mfr: "Sunset West", ...r });
  }

  // ── Summary ──
  console.log("\n═══════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  let totalUpdated = 0;
  for (const { mfr, updated, skipped, noData } of results) {
    console.log(
      `  ${mfr.padEnd(20)} updated=${updated}  skipped=${skipped}  noData=${noData}`
    );
    totalUpdated += updated;
  }
  console.log(`\n  TOTAL updated: ${totalUpdated}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
