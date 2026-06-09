/**
 * Seed ALL Galtech products from the 2026 MSRP + sale pricing CSV.
 *
 * Product classes (derived per CSV row):
 *  - UMBRELLA   : grade pricing (Sunbrella A/B/C/D) + REQUIRED vent-type
 *                 variant (Single/Double, price-driving, button UI) + finish
 *                 options + all-Sunbrella fabric pool. Updates existing GT-XXX
 *                 products in place.
 *  - COVER      : grade pricing + Sunbrella fabric pool, NO vent, NO finish.
 *                 One variant carries the grade prices.
 *  - FLAT_FINISH: flat single price + finish selection, modeled as the legacy
 *                 "variant == finish" pattern (one variant per finish color).
 *  - FLAT_PLAIN : flat single price, no options (hardware, "all finishes" tube).
 *
 * Idempotent: per product we delete + re-create variants / finish options /
 * fabric pools, then upsert the product row by SKU.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedGaltech.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productFinishOptionsTable,
  productFabricPoolsTable,
  productFabricOptionsTable,
  fabricsTable,
  finishesTable,
} from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "../../attached_assets");

const GALTECH_MFR = 29;
const SUNBRELLA_MFR = 11;
const CAT_UMBRELLAS = 38;
const CAT_BASES = 39;
const CAT_PARTS = 41;

const GRADES = ["A", "B", "C", "D"] as const;

// ─── CSV parsing ────────────────────────────────────────────────────────────

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

function parseCsvFile(filename: string): Record<string, string>[] {
  const p = path.join(ASSETS, filename);
  const text = fs.readFileSync(p, "utf-8");
  const lines = text.split(/\r?\n/);
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

// ─── helpers ──────────────────────────────────────────────────────────────

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type RowType = "UMBRELLA" | "COVER" | "FLAT_FINISH" | "FLAT_PLAIN";

function classify(row: Record<string, string>): RowType {
  const hasGrade = !!row.sunbrella_a_msrp;
  const hasVent = !!row.vent_type;
  const finishesRaw = row.available_finishes;
  const hasFinishes = !!finishesRaw && finishesRaw.toLowerCase() !== "all finishes";
  if (hasGrade && hasVent) return "UMBRELLA";
  if (hasGrade && !hasVent) return "COVER";
  if (hasFinishes) return "FLAT_FINISH";
  return "FLAT_PLAIN";
}

/** Map a CSV umbrella model (sans -DV) to its product SKU. */
function umbrellaSku(model: string): string {
  const m = model.replace(/-DV$/, "");
  // CSV uses "121-221" and "132-232" for dual-model umbrellas; map to the primary model number.
  const overrides: Record<string, string> = {
    "121-221": "121",
    "132-232": "132",
  };
  return overrides[m] ?? m;
}

function partSku(model: string, type: RowType): string {
  if (type === "COVER") return `COVER-${model.replace(/-xx$/, "")}`;
  return model;
}

/** Strip the leading model-number token from a CSV product_name.
 * e.g. "727 7.5' Deluxe Auto Tilt" → "7.5' Deluxe Auto Tilt"
 *      "121/221 7.5' Cafe, Bistro" → "7.5' Cafe, Bistro"
 *      "532TK 9' Designer Teak"   → "9' Designer Teak"
 */
function cleanProductName(csvProductName: string): string {
  return csvProductName.replace(/^\S+\s+/, "").trim();
}

// ─── finish resolution ────────────────────────────────────────────────────

async function buildFinishMaps() {
  const rows = await db
    .select({
      id: finishesTable.id,
      name: finishesTable.name,
      itemNumber: finishesTable.itemNumber,
    })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, GALTECH_MFR));

  const byName = new Map<string, number>();
  const byCode = new Map<string, number>();
  const meta = new Map<number, { name: string; code: string }>();
  for (const r of rows) {
    byName.set(r.name.toLowerCase(), r.id);
    if (r.itemNumber) byCode.set(r.itemNumber.toUpperCase(), r.id);
    meta.set(r.id, { name: r.name, code: r.itemNumber ?? "" });
  }
  // Aliases for spellings used in the CSV that differ from the finish names.
  const alias = (from: string, toKey: string) => {
    const id = byName.get(toKey);
    if (id != null) byName.set(from, id);
  };
  alias("ribbed champagne", "rib champagne");
  alias("teak wood", "teak");
  // "S" is used interchangeably with "SR" (Silver) in the frame rows.
  const silver = byCode.get("SR");
  if (silver != null) byCode.set("S", silver);

  return { byName, byCode, meta };
}

type FinishMaps = Awaited<ReturnType<typeof buildFinishMaps>>;

/** Resolve a single finish token ("Antique Bronze (AB)" | "AB" | "Light Wood"). */
function resolveFinish(token: string, maps: FinishMaps): number | null {
  const t = token.trim();
  if (!t) return null;
  const parenIdx = t.indexOf("(");
  if (parenIdx >= 0) {
    const name = t.slice(0, parenIdx).trim().toLowerCase();
    const code = t.slice(parenIdx + 1, t.indexOf(")")).trim().toUpperCase();
    return maps.byName.get(name) ?? maps.byCode.get(code) ?? null;
  }
  return maps.byCode.get(t.toUpperCase()) ?? maps.byName.get(t.toLowerCase()) ?? null;
}

/** Resolve + dedupe the available_finishes field into ordered finish ids. */
function resolveFinishList(raw: string, maps: FinishMaps): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const tok of raw.split(",")) {
    const id = resolveFinish(tok, maps);
    if (id == null) {
      if (tok.trim()) console.warn(`  WARN: unresolved finish "${tok.trim()}"`);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ─── product upsert ─────────────────────────────────────────────────────────

async function findProductBySku(sku: string): Promise<number | null> {
  const [row] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, sku));
  return row?.id ?? null;
}

async function clearProductConfig(productId: number) {
  await db
    .delete(productVariantsTable)
    .where(eq(productVariantsTable.productId, productId));
  await db
    .delete(productFinishOptionsTable)
    .where(eq(productFinishOptionsTable.productId, productId));
  await db
    .delete(productFabricPoolsTable)
    .where(eq(productFabricPoolsTable.productId, productId));
  await db
    .delete(productFabricOptionsTable)
    .where(eq(productFabricOptionsTable.productId, productId));
}

// All active Sunbrella fabric ids, ordered for stable display.
async function sunbrellaFabricIds(): Promise<number[]> {
  const rows = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(
      and(
        eq(fabricsTable.manufacturerId, SUNBRELLA_MFR),
        eq(fabricsTable.isActive, true),
      ),
    )
    .orderBy(fabricsTable.name);
  return rows.map((r) => r.id);
}

// Mirror Treasure Garden: link every active Sunbrella fabric to the product as
// an explicit product_fabric_options row (satisfies cart/order fabric FKs).
async function linkSunbrellaFabrics(productId: number, fabricIds: number[]) {
  if (!fabricIds.length) return;
  await db.insert(productFabricOptionsTable).values(
    fabricIds.map((fabricId, idx) => ({
      productId,
      fabricId,
      displayOrder: idx,
    })),
  );
}

async function insertGradePrices(
  variantId: number,
  row: Record<string, string>,
) {
  const vals = GRADES.map((g) => {
    const msrp = row[`sunbrella_${g.toLowerCase()}_msrp`];
    const sale = row[`sunbrella_${g.toLowerCase()}_sale`];
    if (!msrp || !sale) return null;
    return { variantId, grade: g, msrp, salePrice: sale };
  }).filter((v): v is NonNullable<typeof v> => v !== null);
  if (vals.length) await db.insert(variantGradePricesTable).values(vals);
}

// ─── main ────────────────────────────────────────────────────────────────

async function main() {
  const csv = fs
    .readdirSync(ASSETS)
    .find((f) => f.startsWith("galtech_msrp_and_sale_pricing_2026"));
  if (!csv) throw new Error("Galtech pricing CSV not found in attached_assets");
  console.log(`Reading ${csv}`);
  const rows = parseCsvFile(csv);
  const maps = await buildFinishMaps();
  const sunbrellaIds = await sunbrellaFabricIds();
  console.log(`Linking ${sunbrellaIds.length} active Sunbrella fabrics`);

  // Group umbrella rows by product SKU (one product, 1-2 vent variants).
  const umbrellaGroups = new Map<string, Record<string, string>[]>();
  const singles: { sku: string; type: RowType; row: Record<string, string> }[] =
    [];

  for (const row of rows) {
    const type = classify(row);
    if (type === "UMBRELLA") {
      const sku = umbrellaSku(row.model_number);
      const list = umbrellaGroups.get(sku) ?? [];
      list.push(row);
      umbrellaGroups.set(sku, list);
    } else {
      singles.push({ sku: partSku(row.model_number, type), type, row });
    }
  }

  const counts = { umbrella: 0, cover: 0, flatFinish: 0, flatPlain: 0, skipped: 0 };

  // ── Umbrellas ──────────────────────────────────────────────────────────
  for (const [sku, ventRows] of umbrellaGroups) {
    const productId = await findProductBySku(sku);
    if (productId == null) {
      console.warn(`  WARN: umbrella product ${sku} not found — skipping`);
      counts.skipped++;
      continue;
    }
    await clearProductConfig(productId);

    // Default price = Single Vent (or only vent) grade A.
    const defaultRow =
      ventRows.find((r) => /single/i.test(r.vent_type)) ?? ventRows[0]!;
    await db
      .update(productsTable)
      .set({
        name: cleanProductName(defaultRow.product_name),
        price: defaultRow.sunbrella_a_msrp,
        msrp: defaultRow.sunbrella_a_msrp,
        salePrice: defaultRow.sunbrella_a_sale,
        showPriceOnline: true,
        availableOnline: true,
        isActive: true,
        pricingMode: "fixed",
      })
      .where(eq(productsTable.id, productId));

    // Vent variants (price-driving). Single first.
    const ordered = [...ventRows].sort((a, b) =>
      /single/i.test(a.vent_type) ? -1 : /single/i.test(b.vent_type) ? 1 : 0,
    );
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i]!;
      const isDouble = /double/i.test(r.vent_type);
      const [v] = await db
        .insert(productVariantsTable)
        .values({
          productId,
          variantSku: isDouble ? `${sku}-DV` : sku,
          variantName: r.vent_type,
          optionLabel: "Vent Type",
          priceAdjustment: "0",
          notes: r.notes || null,
          displayOrder: i,
          isActive: true,
        })
        .returning({ id: productVariantsTable.id });
      await insertGradePrices(v!.id, r);
    }

    // Finish options (from the available_finishes column).
    const finishIds = resolveFinishList(defaultRow.available_finishes, maps);
    if (finishIds.length) {
      await db.insert(productFinishOptionsTable).values(
        finishIds.map((finishId, idx) => ({
          productId,
          finishId,
          displayOrder: idx,
        })),
      );
    }

    // Explicit all-Sunbrella fabric links (mirrors Treasure Garden).
    await linkSunbrellaFabrics(productId, sunbrellaIds);

    counts.umbrella++;
  }

  // ── Covers / flat-finish / flat-plain ──────────────────────────────────
  for (const { sku, type, row } of singles) {
    const name = cleanProductName(row.product_name);
    const notes = row.notes;
    const baseFields = {
      manufacturerId: GALTECH_MFR,
      showPriceOnline: true,
      availableOnline: true,
      inStoreOnly: false,
      isActive: true,
      quoteOnly: false,
      pricingMode: "fixed" as const,
    };

    let categoryId = CAT_PARTS;
    if (type === "FLAT_FINISH" || type === "FLAT_PLAIN") {
      if (row.category === "Bases") categoryId = CAT_BASES;
    }

    // Pricing.
    let price: string | null = null;
    let msrp: string | null = null;
    let salePrice: string | null = null;
    if (type === "COVER") {
      price = row.sunbrella_a_msrp || null;
      msrp = row.sunbrella_a_msrp || null;
      salePrice = row.sunbrella_a_sale || null;
    } else {
      price = row.single_item_msrp || null;
      msrp = row.single_item_msrp || null;
      salePrice = row.single_item_sale || null;
    }

    // Description: flat products surface notes here (variant notes only render
    // for grade-mode products on the PDP).
    const descParts = [name];
    if ((type === "FLAT_FINISH" || type === "FLAT_PLAIN") && notes) {
      descParts.push(notes);
    }
    const description = descParts.join(" — ");

    let productId = await findProductBySku(sku);
    if (productId == null) {
      const [p] = await db
        .insert(productsTable)
        .values({
          ...baseFields,
          name,
          slug: slugify(`${name}-${sku}`),
          sku,
          shortDescription: name,
          description,
          categoryId,
          price,
          msrp,
          salePrice,
        })
        .returning({ id: productsTable.id });
      productId = p!.id;
    } else {
      await db
        .update(productsTable)
        .set({ ...baseFields, categoryId, price, msrp, salePrice, description })
        .where(eq(productsTable.id, productId));
    }
    await clearProductConfig(productId);

    if (type === "COVER") {
      const [v] = await db
        .insert(productVariantsTable)
        .values({
          productId,
          variantSku: sku,
          variantName: row.size || "Standard",
          optionLabel: "Configuration",
          priceAdjustment: "0",
          notes: notes || null,
          displayOrder: 0,
          isActive: true,
        })
        .returning({ id: productVariantsTable.id });
      await insertGradePrices(v!.id, row);
      // Explicit all-Sunbrella fabric links (mirrors Treasure Garden).
      await linkSunbrellaFabrics(productId, sunbrellaIds);
      counts.cover++;
    } else if (type === "FLAT_FINISH") {
      const finishIds = resolveFinishList(row.available_finishes, maps);
      if (!finishIds.length) {
        counts.flatPlain++;
        continue;
      }
      for (let i = 0; i < finishIds.length; i++) {
        const fid = finishIds[i]!;
        const fm = maps.meta.get(fid)!;
        await db.insert(productVariantsTable).values({
          productId,
          variantSku: `${sku}-${fm.code || fid}`,
          variantName: fm.name,
          optionLabel: "Finish",
          priceAdjustment: "0",
          displayOrder: i,
          isActive: true,
        });
      }
      counts.flatFinish++;
    } else {
      counts.flatPlain++;
    }
  }

  // ── Deactivate the legacy grouped base placeholders ────────────────────
  const groupedBaseSkus = [
    "europeanbases",
    "steel-plate-bases",
    "wheels-bases",
    "heavy-weight-bases",
  ];
  await db
    .update(productsTable)
    .set({ isActive: false, availableOnline: false })
    .where(
      and(
        eq(productsTable.manufacturerId, GALTECH_MFR),
        inArray(productsTable.sku, groupedBaseSkus),
      ),
    );

  console.log("Done:", counts);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
