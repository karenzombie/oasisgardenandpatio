import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  finishCollectionsTable,
  finishesTable,
  manufacturersTable,
  productsTable,
  productFinishOptionsTable,
  productFinishPoolsTable,
  productImagesTable,
} from "@workspace/db";
import {
  ListCatalogManufacturerFinishesResponse,
  ListCatalogFinishProductsResponse,
} from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// Public catalog of active manufacturer finishes — mirrors /catalog/fabrics.
// Shows the full active finish library (not just product-mapped ones) so
// the page doubles as a brand/showroom reference.
router.get(
  "/catalog/manufacturer-finishes",
  async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const whereClause = q
      ? and(
          eq(finishesTable.isActive, true),
          or(
            ilike(finishesTable.name, `%${q}%`),
            ilike(finishesTable.itemNumber, `%${q}%`),
          ),
        )
      : eq(finishesTable.isActive, true);

    const rows = await db
      .select({
        id: finishesTable.id,
        name: finishesTable.name,
        itemNumber: finishesTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        manufacturerLogoUrl: manufacturersTable.logoUrl,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        collection: finishesTable.collection,
        displayOrder: finishesTable.displayOrder,
      })
      .from(finishesTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, finishesTable.manufacturerId),
      )
      .where(whereClause)
      .orderBy(
        asc(manufacturersTable.name),
        asc(finishesTable.displayOrder),
        asc(finishesTable.name),
      );

    const collectionRows = await db
      .select({
        id: finishCollectionsTable.id,
        manufacturerId: finishCollectionsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        collectionName: finishCollectionsTable.collectionName,
        panelImageUrl: finishCollectionsTable.panelImageUrl,
        displayOrder: finishCollectionsTable.displayOrder,
      })
      .from(finishCollectionsTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, finishCollectionsTable.manufacturerId),
      )
      .where(eq(finishCollectionsTable.isActive, true))
      .orderBy(asc(finishCollectionsTable.displayOrder));

    res.json(
      ListCatalogManufacturerFinishesResponse.parse({
        finishes: rows.map((r) => ({
          ...r,
          imageUrl: toPublicImageUrl(r.imageUrl),
          manufacturerLogoUrl: toPublicImageUrl(r.manufacturerLogoUrl),
        })),
        finishCollections: collectionRows.map((c) => ({
          ...c,
          panelImageUrl: toPublicImageUrl(c.panelImageUrl),
        })),
      }),
    );
  },
);

// Public list of products that offer the given finish as an option. Used
// by the customer-facing /finishes page to power the "products that use
// this finish" modal when a swatch is clicked.
router.get(
  "/catalog/manufacturer-finishes/:id/products",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }

    const finishRows = await db
      .select({
        id: finishesTable.id,
        manufacturerId: finishesTable.manufacturerId,
        name: finishesTable.name,
        itemNumber: finishesTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        manufacturerLogoUrl: manufacturersTable.logoUrl,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        displayOrder: finishesTable.displayOrder,
      })
      .from(finishesTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, finishesTable.manufacturerId),
      )
      .where(
        and(eq(finishesTable.id, id), eq(finishesTable.isActive, true)),
      )
      .limit(1);

    const finish = finishRows[0];
    if (!finish) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }

    // A product offers this finish if EITHER it has a direct
    // product_finish_options row, OR it has a product_finish_pools row for
    // the finish's manufacturer (pool = "every active finish from this
    // manufacturer"). Mirrors the union rule documented in the schema.
    const productSelect = {
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      primaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
          and ${productImagesTable.imageKind} = 'gallery'
        order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
        limit 1
      )`,
    };
    const visibility = and(
      eq(productsTable.isActive, true),
      eq(productsTable.availableOnline, true),
    );

    const [directRows, poolRows] = await Promise.all([
      db
        .select(productSelect)
        .from(productFinishOptionsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productFinishOptionsTable.productId),
        )
        .where(and(eq(productFinishOptionsTable.finishId, id), visibility)),
      db
        .select(productSelect)
        .from(productFinishPoolsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productFinishPoolsTable.productId),
        )
        .where(
          and(
            eq(
              productFinishPoolsTable.manufacturerId,
              finish.manufacturerId,
            ),
            visibility,
          ),
        ),
    ]);

    // Dedupe by product id and sort by name. (Direct + pool can overlap.)
    const byId = new Map<number, (typeof directRows)[number]>();
    for (const r of [...directRows, ...poolRows]) byId.set(r.id, r);
    const productRows = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const { manufacturerId: _omit, ...finishOut } = finish;
    void _omit;
    res.json(
      ListCatalogFinishProductsResponse.parse({
        finish: {
          ...finishOut,
          imageUrl: toPublicImageUrl(finish.imageUrl),
          manufacturerLogoUrl: toPublicImageUrl(finish.manufacturerLogoUrl),
        },
        products: productRows.map((p) => ({
          ...p,
          primaryImageUrl: toPublicImageUrl(p.primaryImageUrl),
        })),
      }),
    );
  },
);

export default router;
