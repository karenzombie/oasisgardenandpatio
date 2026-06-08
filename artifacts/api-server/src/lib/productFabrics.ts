import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  fabricsTable,
  manufacturersTable,
  productFabricOptionsTable,
  productFabricPoolsTable,
} from "@workspace/db";

export type ResolvedFabric = {
  id: number;
  name: string;
  itemNumber: string;
  manufacturerId: number;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  swatchImageUrl: string | null;
  grade: string | null;
  colorFamily: string | null;
  isStripe: boolean;
  displayOrder: number;
};

/**
 * Resolve the full set of fabrics a product offers. The effective set is the
 * UNION of:
 *   - pool-expanded manufacturer fabrics (every active fabric from a pooled
 *     manufacturer, e.g. an "all Sunbrella" pool used by grade-priced umbrellas)
 *   - individually-picked fabric options (legacy TG-style explicit links)
 *
 * Both customer (PDP, cart) and staff (order builder) read paths must use this
 * so a pooled-only product is never treated as having no fabrics. Results are
 * deduped by fabric id and sorted by displayOrder, then manufacturer, then name.
 */
export async function resolveProductFabrics(
  productId: number,
): Promise<ResolvedFabric[]> {
  const poolMfrRows = await db
    .select({ manufacturerId: productFabricPoolsTable.manufacturerId })
    .from(productFabricPoolsTable)
    .where(eq(productFabricPoolsTable.productId, productId));
  const poolMfrIds = poolMfrRows.map((p) => p.manufacturerId);

  const pooledRows = poolMfrIds.length
    ? await db
        .select({
          id: fabricsTable.id,
          name: fabricsTable.name,
          itemNumber: fabricsTable.itemNumber,
          manufacturerId: fabricsTable.manufacturerId,
          manufacturerName: manufacturersTable.name,
          manufacturerLogoUrl: manufacturersTable.logoUrl,
          swatchImageUrl: fabricsTable.swatchImageUrl,
          grade: fabricsTable.grade,
          colorFamily: fabricsTable.colorFamily,
          isStripe: fabricsTable.isStripe,
          displayOrder: fabricsTable.displayOrder,
        })
        .from(fabricsTable)
        .innerJoin(
          manufacturersTable,
          eq(manufacturersTable.id, fabricsTable.manufacturerId),
        )
        .where(
          and(
            inArray(fabricsTable.manufacturerId, poolMfrIds),
            eq(fabricsTable.isActive, true),
          ),
        )
    : [];

  const optionRows = await db
    .select({
      id: fabricsTable.id,
      name: fabricsTable.name,
      itemNumber: fabricsTable.itemNumber,
      manufacturerId: fabricsTable.manufacturerId,
      manufacturerName: manufacturersTable.name,
      manufacturerLogoUrl: manufacturersTable.logoUrl,
      swatchImageUrl: fabricsTable.swatchImageUrl,
      grade: fabricsTable.grade,
      colorFamily: fabricsTable.colorFamily,
      isStripe: fabricsTable.isStripe,
      displayOrder: productFabricOptionsTable.displayOrder,
    })
    .from(productFabricOptionsTable)
    .innerJoin(
      fabricsTable,
      eq(fabricsTable.id, productFabricOptionsTable.fabricId),
    )
    .innerJoin(
      manufacturersTable,
      eq(manufacturersTable.id, fabricsTable.manufacturerId),
    )
    .where(
      and(
        eq(productFabricOptionsTable.productId, productId),
        eq(fabricsTable.isActive, true),
      ),
    )
    .orderBy(asc(productFabricOptionsTable.displayOrder));

  const byId = new Map<number, ResolvedFabric>();
  for (const f of [...optionRows, ...pooledRows]) {
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.displayOrder - b.displayOrder ||
      a.manufacturerName.localeCompare(b.manufacturerName) ||
      a.name.localeCompare(b.name),
  );
}
