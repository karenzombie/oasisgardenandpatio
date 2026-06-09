/**
 * Categorize uncategorized products for manufacturers that currently have no
 * (or partial) category assignments, so the storefront "Shop by Type" tiles
 * can appear for them.
 *
 * Target manufacturers: Hanamint, Summerset, Tropitone, NorthCape.
 * Only products with category_id IS NULL are touched (existing categorized
 * NorthCape products are left untouched).
 *
 * Rules are ordered, FIRST MATCH WINS. Parts/cushions/hardware are matched
 * first so a "Cushion for Club Chair" becomes a Replacement Part, not a chair.
 *
 * Dry-run by default. Set APPLY=1 to write changes.
 * Uses whatever DATABASE_URL is set (override with PROD_DATABASE_URL for prod).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productsTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";

const TARGET_MFRS = ["Hanamint", "Summerset", "Tropitone", "NorthCape"];

// Ordered rules. First matching regex (against lowercased name) wins.
const RULES: Array<{ slug: string; re: RegExp; label: string }> = [
  // 1. Replacement parts / cushions / hardware (match BEFORE furniture types)
  {
    slug: "cat-replacement-parts",
    label: "Replacement Parts",
    re: /cushion|sling rail|end cap|set screw|\bglide\b|glass guard|\bguard\b|center plate|\bplate\b|\bbushing\b|\bspray\b|touch[ -]?up|touch paint|\bpaint\b|top coat|\bspreader\b|\bfinial\b|\bbracket\b|hardware|\bgrommet\b|\bleg\b|\bcaps?\b|\bscrew\b|umbrella hub|\bhub\b|conversion kit|\bkit\b|propane|thermocouple|\bvalve\b|gas cylinder|\bhose\b|\bcaster|bearing ring|table base|middle support|table plug|\bplug\b|towel rack|cross section|\breplacement\b|add[ -]?on weight|\bweight\b|tight sling|\bspring\b|\btires?\b/,
  },
  // 2. Fire tables
  {
    slug: "cat-fire-tables",
    label: "Fire Tables",
    re: /fire ?table|firetable|fire ?pit|fire ?glass|fireglass|fire bowl|\bfire\b/,
  },
  // 3. Umbrella bases (before umbrellas)
  {
    slug: "cat-umbrella-bases",
    label: "Umbrella Bases",
    re: /umbrella base|umbrella stand/,
  },
  // 4. Umbrellas
  { slug: "cat-umbrellas", label: "Umbrellas", re: /umbrella/ },
  // 5. Daybeds
  { slug: "cat-daybeds", label: "Daybeds", re: /day ?bed|sun ?bed/ },
  // 6. Chaise lounges
  { slug: "cat-chaise-lounges", label: "Chaise Lounges", re: /chaise/ },
  // 7. Coffee & side tables (before generic dining)
  {
    slug: "cat-coffee-side-tables",
    label: "Coffee & Side Tables",
    re: /coffee table|side table|end table|chat table|tea table|ice bucket|occasional|console/,
  },
  // 8. Bar (stools / bar-height) — only stools/bar, NOT counter-height dining
  {
    slug: "cat-bar",
    label: "Bar",
    re: /bar ?stool|\bbarstool\b|counter ?stool|swivel stool|\bstool\b|\bbar\b/,
  },
  // 9. Dining (handles typo "dinging")
  {
    slug: "cat-dining",
    label: "Dining",
    re: /din(ing|ging)|bistro|\bcafe\b|side chair|\bhutch\b/,
  },
  // 10. Deep seating
  {
    slug: "cat-deep-seating",
    label: "Deep Seating",
    re: /\bsofa\b|love ?seat|sectional|club chair|swivel rocker|\brocker\b|settee|glider|recliner|lounge chair|deep seat|\bmodule\b|modular|armless|left arm|right arm|corner chair|\blounger\b|swivel club|spa chair|arm ?chair|conversation/,
  },
  // 11. Accent pieces
  {
    slug: "cat-accent-pieces",
    label: "Accent Pieces",
    re: /ottoman|\bbench\b|planter|\bbox\b|\baccent\b|serving cart|\bcart\b|garden pot|wine bottle|bottle holder|candle holder|receptacle/,
  },
  // 12. Outdoor rugs
  { slug: "outdoor-rugs", label: "Outdoor Rugs", re: /\brug\b/ },
  // 13. Protective covers
  { slug: "protective-covers", label: "Protective Covers", re: /\bcover\b|protective/ },
  // 14. Generic table catch-all (extension/rectangular/counter/pedestal/etc.)
  { slug: "cat-dining", label: "Dining", re: /\btable\b/ },
];

async function main() {
  const apply = process.env.APPLY === "1";

  const cats = await db
    .select({ id: categoriesTable.id, slug: categoriesTable.slug })
    .from(categoriesTable);
  const catIdBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const activeRules = RULES.filter((r) => {
    if (!catIdBySlug.has(r.slug)) {
      console.warn(`Skipping rule for missing category slug: ${r.slug}`);
      return false;
    }
    return true;
  });

  const mfrs = await db
    .select({ id: manufacturersTable.id, name: manufacturersTable.name })
    .from(manufacturersTable)
    .where(inArray(manufacturersTable.name, TARGET_MFRS));
  const mfrIds = mfrs.map((m) => m.id);
  const mfrNameById = new Map(mfrs.map((m) => [m.id, m.name]));

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      manufacturerId: productsTable.manufacturerId,
    })
    .from(productsTable)
    .where(
      and(
        inArray(productsTable.manufacturerId, mfrIds),
        isNull(productsTable.categoryId),
      ),
    );

  // slug -> list of product ids to assign
  const assignBySlug = new Map<string, number[]>();
  const uncategorized: Array<{ name: string; mfr: string }> = [];
  // per-mfr per-category tally
  const tally = new Map<string, Map<string, number>>();

  for (const p of products) {
    const ln = p.name.toLowerCase();
    const rule = activeRules.find((r) => r.re.test(ln));
    const mfr = mfrNameById.get(p.manufacturerId!) ?? "?";
    if (!rule) {
      uncategorized.push({ name: p.name, mfr });
      continue;
    }
    if (!assignBySlug.has(rule.slug)) assignBySlug.set(rule.slug, []);
    assignBySlug.get(rule.slug)!.push(p.id);
    if (!tally.has(mfr)) tally.set(mfr, new Map());
    const t = tally.get(mfr)!;
    t.set(rule.label, (t.get(rule.label) ?? 0) + 1);
  }

  console.log(`\n=== Categorization ${apply ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log(`Target mfrs: ${TARGET_MFRS.join(", ")}`);
  console.log(`Uncategorized products considered: ${products.length}`);

  for (const mfr of TARGET_MFRS) {
    const t = tally.get(mfr);
    const total = products.filter((p) => mfrNameById.get(p.manufacturerId!) === mfr).length;
    console.log(`\n--- ${mfr} (${total} uncategorized) ---`);
    if (t) {
      for (const [label, c] of [...t.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${label}: ${c}`);
      }
    }
    const left = uncategorized.filter((u) => u.mfr === mfr).length;
    console.log(`  >> still uncategorized: ${left}`);
  }

  const matched = products.length - uncategorized.length;
  console.log(`\nTotal matched: ${matched} / ${products.length}`);
  console.log(`Total still uncategorized: ${uncategorized.length}`);
  console.log(`\n--- Sample still-uncategorized names (up to 40) ---`);
  for (const u of uncategorized.slice(0, 40)) {
    console.log(`  [${u.mfr}] ${u.name}`);
  }

  if (!apply) {
    console.log(`\nDry run only. Set APPLY=1 to write.`);
    return;
  }

  let updated = 0;
  for (const [slug, ids] of assignBySlug.entries()) {
    const catId = catIdBySlug.get(slug)!;
    // chunk to keep statements reasonable
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const res = await db
        .update(productsTable)
        .set({ categoryId: catId })
        .where(
          and(
            inArray(productsTable.id, chunk),
            isNull(productsTable.categoryId),
          ),
        );
      updated += chunk.length;
    }
    console.log(`  set ${ids.length} -> ${slug}`);
  }
  console.log(`\nApplied. Rows targeted: ${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
