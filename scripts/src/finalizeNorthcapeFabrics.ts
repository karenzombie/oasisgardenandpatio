import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { and, eq, ne, inArray } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  fabricsTable,
  finishesTable,
  productsTable,
  productFinishOptionsTable,
  productFabricOptionsTable,
} from "@workspace/db";

// Executor that works for both the root `db` and a transaction handle.
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Finalize NorthCape (manufacturer 17) Materials > Fabrics:
//   Part A — add 6 user-confirmed Sunbrella fabrics whose swatches existed on
//            disk but were absent from the original CSV (no grade).
//   Part B — full move of Belenos (12) + Wicker (8) from Finishes into Fabrics:
//            recreate them as fabrics, re-wire every product_finish_options link
//            to product_fabric_options, then delete the finishes.
// Idempotent: fabrics upsert by (manufacturer_id, item_number); fabric-option
// inserts use ON CONFLICT DO NOTHING; a second run finds no Belenos/Wicker
// finishes left and is a no-op.
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const SUNBRELLA_SWATCH_DIR = resolve(WORKSPACE_ROOT, "nc_sunbrella_swatches");
const MANUFACTURER_ID = 17; // NorthCape
const STORAGE_SUBDIR = "fabrics/swatches/northcape";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// User-confirmed Sunbrella fabrics (name -> swatch filename). No grade.
const CONFIRMED_SUNBRELLA: { name: string; file: string }[] = [
  { name: "Fretwork Mist", file: "nc_fretwork-mist.jpg" },
  { name: "Gateway Fuse", file: "nc_gateway-fuse.jpg" },
  { name: "Highlight Ivy", file: "nc_highlight-ivy.jpg" },
  { name: "Highlight Splendor", file: "nc_highlight-splendor.jpg" },
  { name: "Shore Linen", file: "nc_shore-linen.jpg" },
  { name: "Violetta Baltic", file: "nc_violetta-baltic.jpg" },
];

// ---------------------------------------------------------------------------
// Object Storage client (mirrors seedNorthcapeSunbrellaFabrics.ts)
// ---------------------------------------------------------------------------

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadBuffer(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const file = storage.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// Upsert a fabric by (manufacturer_id, item_number=name). Returns its id.
async function upsertFabric(
  exec: DbExecutor,
  opts: {
    name: string;
    collection: string;
    swatchImageUrl: string | null;
    displayOrder: number;
    isActive: boolean;
  },
): Promise<{ id: number; created: boolean }> {
  const [existing] = await exec
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(
      and(
        eq(fabricsTable.manufacturerId, MANUFACTURER_ID),
        eq(fabricsTable.itemNumber, opts.name),
      ),
    )
    .limit(1);

  if (existing) {
    await exec
      .update(fabricsTable)
      .set({
        name: opts.name,
        collection: opts.collection,
        grade: null,
        colorFamily: null,
        swatchImageUrl: opts.swatchImageUrl,
        displayOrder: opts.displayOrder,
        isActive: opts.isActive,
      })
      .where(eq(fabricsTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [row] = await exec
    .insert(fabricsTable)
    .values({
      manufacturerId: MANUFACTURER_ID,
      itemNumber: opts.name,
      name: opts.name,
      collection: opts.collection,
      grade: null,
      colorFamily: null,
      isStripe: false,
      swatchImageUrl: opts.swatchImageUrl,
      displayOrder: opts.displayOrder,
      isActive: opts.isActive,
    })
    .returning({ id: fabricsTable.id });
  return { id: row.id, created: true };
}

async function main() {
  // -------------------------------------------------------------------------
  // Part A — confirmed Sunbrella additions
  // -------------------------------------------------------------------------
  let sunInserted = 0;
  let sunUpdated = 0;
  const sunMissing: string[] = [];
  for (const { name, file } of CONFIRMED_SUNBRELLA) {
    const localPath = join(SUNBRELLA_SWATCH_DIR, file);
    if (!existsSync(localPath)) {
      sunMissing.push(`${name} (expected ${file})`);
      continue;
    }
    const swatchImageUrl = await uploadBuffer(await readFile(localPath), file);
    const { created } = await upsertFabric(db, {
      name,
      collection: "Sunbrella",
      swatchImageUrl,
      displayOrder: 0,
      isActive: true,
    });
    if (created) sunInserted++;
    else sunUpdated++;
  }
  console.log(
    `Part A (Sunbrella): inserted=${sunInserted} updated=${sunUpdated}` +
      (sunMissing.length ? ` missing=${sunMissing.join(", ")}` : ""),
  );

  // -------------------------------------------------------------------------
  // Part B — move Belenos + Wicker finishes -> fabrics
  // -------------------------------------------------------------------------
  const finishes = await db
    .select({
      id: finishesTable.id,
      name: finishesTable.name,
      description: finishesTable.description,
      imageUrl: finishesTable.imageUrl,
      displayOrder: finishesTable.displayOrder,
      isActive: finishesTable.isActive,
    })
    .from(finishesTable)
    .where(
      and(
        eq(finishesTable.manufacturerId, MANUFACTURER_ID),
        inArray(finishesTable.description, ["Belenos", "Wicker"]),
      ),
    );

  if (finishes.length === 0) {
    console.log("Part B: no Belenos/Wicker finishes found — already migrated.");
    return;
  }

  const finishIds = finishes.map((f) => f.id);

  // Hard safety guard: abort if ANY product linked to these finishes belongs to
  // a different manufacturer. A finish->fabric move must never silently rewire
  // another manufacturer's products. (Pre-verified manually for dev; enforced
  // here so the prod re-run is safe even if data drifted.)
  const offending = await db
    .select({ productId: productFinishOptionsTable.productId })
    .from(productFinishOptionsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, productFinishOptionsTable.productId),
    )
    .where(
      and(
        inArray(productFinishOptionsTable.finishId, finishIds),
        ne(productsTable.manufacturerId, MANUFACTURER_ID),
      ),
    )
    .limit(1);
  if (offending.length > 0) {
    throw new Error(
      `Aborting: finishes ${finishIds.join(",")} are linked to non-NorthCape ` +
        `product(s) (e.g. ${offending[0].productId}). Refusing destructive move.`,
    );
  }

  const linkRows = await db
    .select({
      finishId: productFinishOptionsTable.finishId,
      productId: productFinishOptionsTable.productId,
      displayOrder: productFinishOptionsTable.displayOrder,
    })
    .from(productFinishOptionsTable)
    .where(inArray(productFinishOptionsTable.finishId, finishIds));

  let fabInserted = 0;
  let fabUpdated = 0;
  let linksMoved = 0;

  // Wrap the mutation set in a single transaction so a partial failure can't
  // leave fabrics created but links/finishes half-migrated.
  await db.transaction(async (tx) => {
    // finishId -> new fabricId
    const fabricIdByFinish = new Map<number, number>();
    for (const f of finishes) {
      const { id, created } = await upsertFabric(tx, {
        name: f.name,
        collection: f.description ?? "",
        swatchImageUrl: f.imageUrl,
        displayOrder: f.displayOrder,
        isActive: f.isActive,
      });
      fabricIdByFinish.set(f.id, id);
      if (created) fabInserted++;
      else fabUpdated++;
    }

    // Re-wire product_finish_options -> product_fabric_options.
    for (const link of linkRows) {
      const fabricId = fabricIdByFinish.get(link.finishId);
      if (!fabricId) continue;
      await tx
        .insert(productFabricOptionsTable)
        .values({
          productId: link.productId,
          fabricId,
          displayOrder: link.displayOrder,
        })
        .onConflictDoNothing();
      linksMoved++;
    }

    // Delete the finishes — cascades away the old product_finish_options rows.
    await tx.delete(finishesTable).where(inArray(finishesTable.id, finishIds));
  });

  console.log(
    `Part B (Belenos/Wicker): finishes=${finishes.length} ` +
      `fabricsInserted=${fabInserted} fabricsUpdated=${fabUpdated} ` +
      `linksMoved=${linksMoved} finishesDeleted=${finishIds.length}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
