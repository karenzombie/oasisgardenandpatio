import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { db, fabricsTable, manufacturersTable } from "@workspace/db";

const CSV_PATH = resolve(
  process.cwd(),
  "../attached_assets/sunbrella_outdoor_upholstery_update_5-27-26_1779911704083.csv",
);
const MANUFACTURER_NAME = "Sunbrella";

type CsvRow = {
  name: string;
  number: string;
  grade: string;
  "color family": string;
  stripe: string;
};

function normalizeColor(raw: string): string | null {
  const v = raw?.trim();
  if (!v) return null;
  // Title-case single-word categories ("blue" -> "Blue", "MULTICOLOR" -> "Multicolor")
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function normalizeGrade(raw: string): string | null {
  const v = raw?.trim().toUpperCase();
  if (v === "A" || v === "B" || v === "C") return v;
  return null;
}

function normalizeStripe(raw: string): boolean {
  return raw?.trim().toLowerCase() === "yes";
}

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }
  const rows = parsed.data.filter((r) => r.number?.trim());
  console.log(`Parsed ${rows.length} CSV rows`);

  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Sunbrella manufacturer id = ${mfg.id}`);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const itemNumber = row.number.trim();
    const name = row.name.trim();
    if (!itemNumber || !name) {
      skipped++;
      continue;
    }
    const grade = normalizeGrade(row.grade);
    const colorFamily = normalizeColor(row["color family"]);
    const isStripe = normalizeStripe(row.stripe);

    const [existing] = await db
      .select({ id: fabricsTable.id })
      .from(fabricsTable)
      .where(
        and(
          eq(fabricsTable.manufacturerId, mfg.id),
          eq(fabricsTable.itemNumber, itemNumber),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(fabricsTable)
        .set({ name, grade, colorFamily, isStripe })
        .where(eq(fabricsTable.id, existing.id));
      updated++;
    } else {
      await db.insert(fabricsTable).values({
        manufacturerId: mfg.id,
        itemNumber,
        name,
        grade,
        colorFamily,
        isStripe,
        isActive: true,
      });
      inserted++;
    }
  }

  console.log(
    `Done. inserted=${inserted} updated=${updated} skipped=${skipped} total_csv=${rows.length}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
