/**
 * One-off repair: earlier product seeds built `short_description` by hard
 * char-clamping the full `description` (e.g. `description.slice(0, 250) + "…"`),
 * which left a visibly truncated teaser ending in an ellipsis on the product
 * page. The full copy was never lost — it is still intact in `description` —
 * but the top-of-PDP blurb showed the clipped version.
 *
 * This script rewrites every truncated `short_description` to the full first
 * paragraph of `description` (see `firstParagraph`), so the leading paragraph
 * shows in full with no "…". Products whose short description is an
 * intentionally generated spec sentence (they do not end in an ellipsis) are
 * left untouched.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/fixShortDescriptions.ts
 */
import { eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { firstParagraph } from "./firstParagraph";

function isTruncated(value: string): boolean {
  return value.trimEnd().endsWith("…") || value.trimEnd().endsWith("...");
}

async function main() {
  const rows = await db
    .select({
      id: productsTable.id,
      description: productsTable.description,
      shortDescription: productsTable.shortDescription,
    })
    .from(productsTable);

  let fixed = 0;
  let skippedNoDescription = 0;

  for (const row of rows) {
    const current = row.shortDescription;
    if (!current || !isTruncated(current)) continue;

    if (!row.description || !row.description.trim()) {
      skippedNoDescription++;
      continue;
    }

    const next = firstParagraph(row.description);
    if (!next || next === current) continue;

    await db
      .update(productsTable)
      .set({ shortDescription: next })
      .where(eq(productsTable.id, row.id));
    fixed++;
  }

  console.log(`Repaired ${fixed} truncated short descriptions.`);
  if (skippedNoDescription > 0) {
    console.log(
      `Skipped ${skippedNoDescription} rows with a truncated teaser but no full description to restore from.`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
