import { db, inventoryLocationsTable } from "@workspace/db";
import { logger } from "./logger";

export async function seedDefaultInventoryLocation(): Promise<void> {
  const existing = await db
    .select({ id: inventoryLocationsTable.id })
    .from(inventoryLocationsTable)
    .limit(1);

  if (existing.length > 0) return;

  const [created] = await db
    .insert(inventoryLocationsTable)
    .values({
      name: "Main Warehouse",
      code: "MAIN",
      address: "Santa Clarita, CA",
      isActive: true,
      isDefault: true,
    })
    .returning({ id: inventoryLocationsTable.id });

  logger.info(
    { locationId: created?.id },
    "Seeded default inventory location",
  );
}
