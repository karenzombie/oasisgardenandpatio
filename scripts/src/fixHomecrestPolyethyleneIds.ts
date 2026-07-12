import { db, finishesTable, finishCollectionsTable, manufacturersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const MANUFACTURER_NAME = "Homecrest";
const COLLECTION_NAME = "Polyethylene";

// Target IDs must match between dev and prod
const TARGET_FINISH_IDS = [515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528];
const TARGET_COLLECTION_ID = 30;

const FINISHES = [
  { id: 515, name: "Anthracite Grey", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-anthracitegrey.jpg" },
  { id: 516, name: "Aqua", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-aqua.jpg" },
  { id: 517, name: "Light Blue", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-lightblue.jpg" },
  { id: 518, name: "Navy Blue", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-navyblue.jpg" },
  { id: 519, name: "Violet", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-violet.jpg" },
  { id: 520, name: "White", description: "Seat pad & head pillow polyethylene finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpool-seatpad-headpillow-colorimages-white.jpg" },
  { id: 521, name: "Desert Sandstone", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-desertsandstone.jpg" },
  { id: 522, name: "Gray Granite", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-graygranite.jpg" },
  { id: 523, name: "Light Blue", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-lightblue.jpg" },
  { id: 524, name: "River Rock", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-riverrock.jpg" },
  { id: 525, name: "Surf Blue", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-surfblue.jpg" },
  { id: 526, name: "White", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-white.jpg" },
  { id: 527, name: "Yellow", description: "In-pool polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-inpoolcolorimages-yellow.jpg" },
  { id: 528, name: "White Granite", description: "Polyethylene body finish", imagePath: "/objects/finishes/homecrest/polyethylene/homecrest-website-productcolorimages-whitegranite.jpg" },
];

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(sql`LOWER(${manufacturersTable.name})`, MANUFACTURER_NAME.toLowerCase()));

  if (!mfg) {
    console.error(`Manufacturer '${MANUFACTURER_NAME}' not found`);
    process.exit(1);
  }

  // Step 1: Delete any existing Polyethylene finishes (by collection, catches both old and new IDs)
  const deletedFinishes = await db
    .delete(finishesTable)
    .where(eq(finishesTable.collection, COLLECTION_NAME))
    .returning({ id: finishesTable.id });
  console.log(`Deleted ${deletedFinishes.length} existing Polyethylene finishes`);

  // Step 2: Delete any existing Polyethylene collection
  const deletedCollections = await db
    .delete(finishCollectionsTable)
    .where(eq(finishCollectionsTable.collectionName, COLLECTION_NAME))
    .returning({ id: finishCollectionsTable.id });
  console.log(`Deleted ${deletedCollections.length} existing Polyethylene collections`);

  // Step 3: Insert collection with explicit ID
  await db.execute(sql`
    INSERT INTO finish_collections (id, manufacturer_id, collection_name, panel_image_url, display_order, is_active, created_at, updated_at)
    VALUES (${TARGET_COLLECTION_ID}, ${mfg.id}, ${COLLECTION_NAME}, NULL, 0, true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      manufacturer_id = EXCLUDED.manufacturer_id,
      collection_name = EXCLUDED.collection_name,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
  `);
  console.log(`Inserted/updated finish collection id=${TARGET_COLLECTION_ID}`);

  // Step 4: Insert finishes with explicit IDs
  for (const f of FINISHES) {
    await db.execute(sql`
      INSERT INTO finishes (id, manufacturer_id, item_number, name, image_url, description, collection, is_active, display_order, created_at, updated_at)
      VALUES (
        ${f.id},
        ${mfg.id},
        NULL,
        ${f.name},
        ${f.imagePath},
        ${f.description},
        ${COLLECTION_NAME},
        true,
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        manufacturer_id = EXCLUDED.manufacturer_id,
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        description = EXCLUDED.description,
        collection = EXCLUDED.collection,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `);
    console.log(`  Inserted/updated finish id=${f.id} name="${f.name}"`);
  }

  // Step 5: Ensure sequence is set past the highest explicit ID so future inserts don't collide
  const maxId = Math.max(...TARGET_FINISH_IDS);
  await db.execute(sql`SELECT setval('finishes_id_seq', GREATEST(${maxId}, (SELECT MAX(id) FROM finishes)), true)`);
  await db.execute(sql`SELECT setval('finish_collections_id_seq', GREATEST(${TARGET_COLLECTION_ID}, (SELECT MAX(id) FROM finish_collections)), true)`);
  console.log(`\nReset sequences: finishes_id_seq >= ${maxId}, finish_collections_id_seq >= ${TARGET_COLLECTION_ID}`);

  // Verify
  const verify = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(eq(finishesTable.collection, COLLECTION_NAME))
    .orderBy(finishesTable.id);
  console.log(`\nVerification: ${verify.length} Polyethylene finishes present`);
  for (const v of verify) {
    console.log(`  ${v.id}: ${v.name}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
