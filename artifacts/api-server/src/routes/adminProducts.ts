import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  productVariantsTable,
  productFabricOptionsTable,
  fabricsTable,
  inventoryTable,
  manufacturersTable,
  categoriesTable,
  materialsTable,
  type Product,
  type ProductImage,
} from "@workspace/db";
import {
  AdminListProductsQueryParams,
  AdminCreateProductBody,
  AdminGetProductParams,
  AdminUpdateProductParams,
  AdminUpdateProductBody,
  AdminSetProductActiveParams,
  AdminSetProductActiveBody,
  AdminAddProductImageParams,
  AdminAddProductImageBody,
  AdminReorderProductImagesParams,
  AdminReorderProductImagesBody,
  AdminDeleteProductImageParams,
  AdminUpdateProductInventoryParams,
  AdminUpdateProductInventoryBody,
  AdminGetProductPickerParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

type ProductRow = Product & {
  manufacturerName: string | null;
  categoryName: string | null;
  materialName: string | null;
  primaryImageUrl: string | null;
  imageCount: number;
  onHand: number;
};

function toAdminPayload(r: ProductRow) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    sku: r.sku,
    description: r.description,
    shortDescription: r.shortDescription,
    manufacturerId: r.manufacturerId,
    manufacturerName: r.manufacturerName,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    materialId: r.materialId,
    materialName: r.materialName,
    price: r.price,
    cost: r.cost,
    msrp: r.msrp,
    markupPercent: r.markupPercent,
    frameOnlyPrice: r.frameOnlyPrice,
    pricingMode: r.pricingMode,
    weight: r.weight,
    dimensions: r.dimensions,
    showPriceOnline: r.showPriceOnline,
    availableOnline: r.availableOnline,
    inStoreOnly: r.inStoreOnly,
    quoteOnly: r.quoteOnly,
    featured: r.featured,
    displayOrder: r.displayOrder,
    lowStockThreshold: r.lowStockThreshold,
    isActive: r.isActive,
    primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
    imageCount: r.imageCount,
    onHand: r.onHand,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function imageToPayload(img: ProductImage) {
  return {
    id: img.id,
    productId: img.productId,
    url: toPublicImageUrl(img.url) ?? img.url,
    altText: img.altText,
    isPrimary: img.isPrimary,
    displayOrder: img.displayOrder,
  };
}

const PRIMARY_IMAGE_SQL = sql<string | null>`(
  select ${productImagesTable.url}
  from ${productImagesTable}
  where ${productImagesTable.productId} = ${productsTable.id}
  order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
  limit 1
)`;

const IMAGE_COUNT_SQL = sql<number>`(
  select count(*)::int
  from ${productImagesTable}
  where ${productImagesTable.productId} = ${productsTable.id}
)`;

const ON_HAND_SQL = sql<number>`coalesce((
  select sum(${inventoryTable.onHand})::int
  from ${inventoryTable}
  where ${inventoryTable.productId} = ${productsTable.id}
), 0)`;

function baseSelect() {
  return db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      description: productsTable.description,
      shortDescription: productsTable.shortDescription,
      manufacturerId: productsTable.manufacturerId,
      manufacturerName: manufacturersTable.name,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      materialId: productsTable.materialId,
      materialName: materialsTable.name,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
      frameOnlyPrice: productsTable.frameOnlyPrice,
      tags: productsTable.tags,
      cost: productsTable.cost,
      msrp: productsTable.msrp,
      markupPercent: productsTable.markupPercent,
      pricingMode: productsTable.pricingMode,
      weight: productsTable.weight,
      dimensions: productsTable.dimensions,
      specs: productsTable.specs,
      showPriceOnline: productsTable.showPriceOnline,
      availableOnline: productsTable.availableOnline,
      inStoreOnly: productsTable.inStoreOnly,
      quoteOnly: productsTable.quoteOnly,
      featured: productsTable.featured,
      displayOrder: productsTable.displayOrder,
      lowStockThreshold: productsTable.lowStockThreshold,
      isActive: productsTable.isActive,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
      primaryImageUrl: PRIMARY_IMAGE_SQL,
      imageCount: IMAGE_COUNT_SQL,
      onHand: ON_HAND_SQL,
    })
    .from(productsTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .leftJoin(
      categoriesTable,
      eq(categoriesTable.id, productsTable.categoryId),
    )
    .leftJoin(materialsTable, eq(materialsTable.id, productsTable.materialId));
}

async function loadProductById(id: number): Promise<ProductRow | null> {
  const [row] = await baseSelect().where(eq(productsTable.id, id));
  return row ?? null;
}

async function ensureFkExists(
  table: typeof manufacturersTable | typeof categoriesTable | typeof materialsTable,
  id: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id));
  return Boolean(row);
}

/**
 * Validate the optional FK fields on a create/update payload.
 * Returns the first error message or null if everything is OK.
 */
async function validateFks(input: {
  manufacturerId?: number | null;
  categoryId?: number | null;
  materialId?: number | null;
}): Promise<string | null> {
  if (input.manufacturerId != null) {
    if (!(await ensureFkExists(manufacturersTable, input.manufacturerId))) {
      return "Manufacturer does not exist";
    }
  }
  if (input.categoryId != null) {
    if (!(await ensureFkExists(categoriesTable, input.categoryId))) {
      return "Category does not exist";
    }
  }
  if (input.materialId != null) {
    if (!(await ensureFkExists(materialsTable, input.materialId))) {
      return "Material does not exist";
    }
  }
  return null;
}

router.get(
  "/admin/products",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const {
      q,
      manufacturerId,
      categoryId,
      isActive,
      featured,
      page = 1,
      pageSize = 50,
      sortBy,
      sortOrder = "asc",
    } = parsed.data;

    const conditions = [];
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      // Match across the most useful "find this product" fields:
      // name (style/title), SKU/slug (item identifiers), description and
      // shortDescription (free-text), and manufacturer name (vendor).
      // Powers the inline typeahead on the staff "New order" page.
      conditions.push(
        or(
          ilike(productsTable.name, needle),
          ilike(productsTable.sku, needle),
          ilike(productsTable.slug, needle),
          ilike(productsTable.description, needle),
          ilike(productsTable.shortDescription, needle),
          ilike(manufacturersTable.name, needle),
        ),
      );
    }
    if (manufacturerId != null) {
      conditions.push(eq(productsTable.manufacturerId, manufacturerId));
    }
    if (categoryId != null) {
      conditions.push(eq(productsTable.categoryId, categoryId));
    }
    if (isActive != null) {
      conditions.push(eq(productsTable.isActive, isActive));
    }
    if (featured != null) {
      conditions.push(eq(productsTable.featured, featured));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;
    const dir = sortOrder === "desc" ? desc : asc;
    const sortColumn = (() => {
      switch (sortBy) {
        case "name":
          return productsTable.name;
        case "sku":
          return productsTable.sku;
        case "manufacturer":
          return manufacturersTable.name;
        case "category":
          return categoriesTable.name;
        case "price":
          return productsTable.price;
        case "onHand":
          return ON_HAND_SQL;
        default:
          return null;
      }
    })();
    const orderClause = sortColumn
      ? [dir(sortColumn), asc(productsTable.id)]
      : [asc(productsTable.displayOrder), asc(productsTable.name)];
    const rowsP = baseSelect()
      .where(whereClause as ReturnType<typeof and>)
      .orderBy(...orderClause)
      .limit(pageSize)
      .offset(offset);
    // Mirror the joins from baseSelect() — the whereClause can reference
    // joined tables (e.g. manufacturers.name in the search OR), so the
    // count query has to provide the same FROM shape or Postgres throws
    // "missing FROM-clause entry for table 'manufacturers'".
    const totalP = db
      .select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productsTable.manufacturerId),
      )
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, productsTable.categoryId),
      )
      .leftJoin(materialsTable, eq(materialsTable.id, productsTable.materialId))
      .where(whereClause as ReturnType<typeof and>);

    const [rows, totalResult] = await Promise.all([rowsP, totalP]);
    res.json({
      products: rows.map(toAdminPayload),
      total: totalResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  },
);

router.get(
  "/admin/products/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const row = await loadProductById(params.data.id);
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const images = await db
      .select()
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, row.id))
      .orderBy(
        desc(productImagesTable.isPrimary),
        asc(productImagesTable.displayOrder),
        asc(productImagesTable.id),
      );
    const [inv] = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.productId, row.id));
    res.json({
      ...toAdminPayload(row),
      images: images.map(imageToPayload),
      inventory: {
        productId: row.id,
        onHand: inv?.onHand ?? 0,
        onHold: inv?.onHold ?? 0,
        reorderThreshold: inv?.reorderThreshold ?? 0,
      },
    });
  },
);

router.post(
  "/admin/products",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const fkError = await validateFks(parsed.data);
    if (fkError) {
      res.status(400).json({ error: fkError });
      return;
    }
    try {
      const [row] = await db
        .insert(productsTable)
        .values({
          name: parsed.data.name,
          slug: parsed.data.slug,
          sku: parsed.data.sku,
          description: parsed.data.description ?? null,
          shortDescription: parsed.data.shortDescription ?? null,
          manufacturerId: parsed.data.manufacturerId ?? null,
          categoryId: parsed.data.categoryId ?? null,
          materialId: parsed.data.materialId ?? null,
          price: parsed.data.price ?? null,
          cost: parsed.data.cost ?? null,
          msrp: parsed.data.msrp ?? null,
          markupPercent: parsed.data.markupPercent ?? null,
          frameOnlyPrice: parsed.data.frameOnlyPrice ?? null,
          pricingMode: parsed.data.pricingMode ?? "fixed",
          weight: parsed.data.weight ?? null,
          dimensions: parsed.data.dimensions ?? null,
          showPriceOnline: parsed.data.showPriceOnline ?? true,
          availableOnline: parsed.data.availableOnline ?? true,
          inStoreOnly: parsed.data.inStoreOnly ?? false,
          quoteOnly: parsed.data.quoteOnly ?? false,
          featured: parsed.data.featured ?? false,
          displayOrder: parsed.data.displayOrder ?? 0,
          lowStockThreshold: parsed.data.lowStockThreshold ?? 0,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      // Seed inventory row (best-effort; ignore conflict)
      await db
        .insert(inventoryTable)
        .values({ productId: row.id, onHand: 0, onHold: 0, reorderThreshold: 0 })
        .onConflictDoNothing();

      const full = await loadProductById(row.id);
      await recordHistory(req, {
        entityType: "product",
        entityId: row.id,
        changeType: "create",
        snapshot: full,
      });
      res.status(201).json(toAdminPayload(full!));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A product with that slug or SKU already exists" });
        return;
      }
      req.log.error({ err }, "Failed to create product");
      res.status(500).json({ error: "Failed to create product" });
    }
  },
);

router.put(
  "/admin/products/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductParams.safeParse(req.params);
    const body = AdminUpdateProductBody.safeParse(req.body);
    if (!params.success || !body.success) {
      const msg =
        params.success === false
          ? params.error.issues[0]?.message
          : body.success === false
            ? body.error.issues[0]?.message
            : "Invalid input";
      res.status(400).json({ error: msg ?? "Invalid input" });
      return;
    }
    const fkError = await validateFks(body.data);
    if (fkError) {
      res.status(400).json({ error: fkError });
      return;
    }
    const previous = await loadProductById(params.data.id);
    try {
      const [row] = await db
        .update(productsTable)
        .set({
          name: body.data.name,
          slug: body.data.slug,
          sku: body.data.sku,
          description: body.data.description ?? null,
          shortDescription: body.data.shortDescription ?? null,
          manufacturerId: body.data.manufacturerId ?? null,
          categoryId: body.data.categoryId ?? null,
          materialId: body.data.materialId ?? null,
          price: body.data.price ?? null,
          cost: body.data.cost ?? null,
          msrp: body.data.msrp ?? null,
          markupPercent: body.data.markupPercent ?? null,
          frameOnlyPrice: body.data.frameOnlyPrice ?? null,
          ...(body.data.pricingMode !== undefined
            ? { pricingMode: body.data.pricingMode }
            : {}),
          weight: body.data.weight ?? null,
          dimensions: body.data.dimensions ?? null,
          ...(body.data.showPriceOnline !== undefined
            ? { showPriceOnline: body.data.showPriceOnline }
            : {}),
          ...(body.data.availableOnline !== undefined
            ? { availableOnline: body.data.availableOnline }
            : {}),
          ...(body.data.inStoreOnly !== undefined
            ? { inStoreOnly: body.data.inStoreOnly }
            : {}),
          ...(body.data.quoteOnly !== undefined
            ? { quoteOnly: body.data.quoteOnly }
            : {}),
          ...(body.data.featured !== undefined
            ? { featured: body.data.featured }
            : {}),
          ...(body.data.displayOrder !== undefined
            ? { displayOrder: body.data.displayOrder }
            : {}),
          ...(body.data.lowStockThreshold !== undefined
            ? { lowStockThreshold: body.data.lowStockThreshold }
            : {}),
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
        })
        .where(eq(productsTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      const full = await loadProductById(row.id);
      await recordHistory(req, {
        entityType: "product",
        entityId: row.id,
        changeType: "update",
        snapshot: full,
        previousSnapshot: previous,
      });
      res.json(toAdminPayload(full!));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A product with that slug or SKU already exists" });
        return;
      }
      req.log.error({ err }, "Failed to update product");
      res.status(500).json({ error: "Failed to update product" });
    }
  },
);

router.patch(
  "/admin/products/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetProductActiveParams.safeParse(req.params);
    const body = AdminSetProductActiveBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const previous = await loadProductById(params.data.id);
    const [row] = await db
      .update(productsTable)
      .set({ isActive: body.data.isActive })
      .where(eq(productsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const full = await loadProductById(row.id);
    await recordHistory(req, {
      entityType: "product",
      entityId: row.id,
      changeType: "update",
      snapshot: full,
      previousSnapshot: previous,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(toAdminPayload(full!));
  },
);

async function loadProductImagesSnapshot(productId: number) {
  const rows = await db
    .select()
    .from(productImagesTable)
    .where(eq(productImagesTable.productId, productId))
    .orderBy(
      desc(productImagesTable.isPrimary),
      asc(productImagesTable.displayOrder),
      asc(productImagesTable.id),
    );
  return rows.map(imageToPayload);
}

router.post(
  "/admin/products/:id/images",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminAddProductImageParams.safeParse(req.params);
    const body = AdminAddProductImageBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    // Lock the parent product row so concurrent image inserts can't both
    // observe the same (count, maxOrder) and produce duplicate primaries.
    try {
      const img = await db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: productsTable.id })
          .from(productsTable)
          .where(eq(productsTable.id, params.data.id))
          .for("update");
        if (!product) return null;
        const existing = await tx
          .select({
            count: sql<number>`count(*)::int`,
            maxOrder: sql<number>`coalesce(max(${productImagesTable.displayOrder}), -1)::int`,
          })
          .from(productImagesTable)
          .where(eq(productImagesTable.productId, product.id));
        const isFirst = (existing[0]?.count ?? 0) === 0;
        const nextOrder = (existing[0]?.maxOrder ?? -1) + 1;
        const [created] = await tx
          .insert(productImagesTable)
          .values({
            productId: product.id,
            url: body.data.url,
            altText: body.data.altText ?? null,
            isPrimary: isFirst,
            displayOrder: nextOrder,
          })
          .returning();
        return created;
      });
      if (!img) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      await recordHistory(req, {
        entityType: "product_images",
        entityId: params.data.id,
        changeType: "replace",
        snapshot: { images: await loadProductImagesSnapshot(params.data.id) },
        notes: `added image #${img.id}`,
      });
      res.status(201).json(imageToPayload(img));
    } catch (err) {
      req.log.error({ err }, "Failed to add product image");
      res.status(500).json({ error: "Failed to add image" });
    }
  },
);

router.put(
  "/admin/products/:id/images/order",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminReorderProductImagesParams.safeParse(req.params);
    const body = AdminReorderProductImagesBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const productId = params.data.id;
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const ids = body.data.images.map((i) => i.id);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    const owned = await db
      .select({ id: productImagesTable.id })
      .from(productImagesTable)
      .where(
        and(
          eq(productImagesTable.productId, productId),
          inArray(productImagesTable.id, ids),
        ),
      );
    if (owned.length !== ids.length) {
      res
        .status(400)
        .json({ error: "All image ids must belong to this product" });
      return;
    }
    const primaryCount = body.data.images.filter((i) => i.isPrimary).length;
    if (primaryCount !== 1) {
      res
        .status(400)
        .json({
          error: "Exactly one image must be marked as primary",
        });
      return;
    }
    const previousImages = await loadProductImagesSnapshot(productId);
    await db.transaction(async (tx) => {
      for (const update of body.data.images) {
        await tx
          .update(productImagesTable)
          .set({
            displayOrder: update.displayOrder,
            isPrimary: update.isPrimary,
          })
          .where(eq(productImagesTable.id, update.id));
      }
    });
    const updated = await db
      .select()
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, productId))
      .orderBy(
        desc(productImagesTable.isPrimary),
        asc(productImagesTable.displayOrder),
        asc(productImagesTable.id),
      );
    await recordHistory(req, {
      entityType: "product_images",
      entityId: productId,
      changeType: "replace",
      snapshot: { images: updated.map(imageToPayload) },
      previousSnapshot: { images: previousImages },
      notes: "reordered images",
    });
    res.json(updated.map(imageToPayload));
  },
);

router.delete(
  "/admin/products/:id/images/:imageId",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteProductImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [img] = await db
      .select()
      .from(productImagesTable)
      .where(
        and(
          eq(productImagesTable.id, params.data.imageId),
          eq(productImagesTable.productId, params.data.id),
        ),
      );
    if (!img) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    const previousImages = await loadProductImagesSnapshot(params.data.id);
    await db
      .delete(productImagesTable)
      .where(eq(productImagesTable.id, img.id));
    if (img.isPrimary) {
      const [next] = await db
        .select({ id: productImagesTable.id })
        .from(productImagesTable)
        .where(eq(productImagesTable.productId, params.data.id))
        .orderBy(
          asc(productImagesTable.displayOrder),
          asc(productImagesTable.id),
        )
        .limit(1);
      if (next) {
        await db
          .update(productImagesTable)
          .set({ isPrimary: true })
          .where(eq(productImagesTable.id, next.id));
      }
    }
    await recordHistory(req, {
      entityType: "product_images",
      entityId: params.data.id,
      changeType: "replace",
      snapshot: { images: await loadProductImagesSnapshot(params.data.id) },
      previousSnapshot: { images: previousImages },
      notes: `deleted image #${img.id}`,
    });
    res.status(204).end();
  },
);

router.get(
  "/admin/products/:id/picker",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductPickerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const [product] = await db
      .select({ id: productsTable.id, frameOnlyPrice: productsTable.frameOnlyPrice })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [variantRows, fabricRows] = await Promise.all([
      db
        .select({
          id: productVariantsTable.id,
          sku: productVariantsTable.variantSku,
          name: productVariantsTable.variantName,
          optionLabel: productVariantsTable.optionLabel,
          priceAdjustment: productVariantsTable.priceAdjustment,
          displayOrder: productVariantsTable.displayOrder,
        })
        .from(productVariantsTable)
        .where(
          and(
            eq(productVariantsTable.productId, product.id),
            eq(productVariantsTable.isActive, true),
          ),
        )
        .orderBy(
          asc(productVariantsTable.displayOrder),
          asc(productVariantsTable.variantName),
        ),
      db
        .select({
          id: fabricsTable.id,
          name: fabricsTable.name,
          itemNumber: fabricsTable.itemNumber,
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
            eq(productFabricOptionsTable.productId, product.id),
            eq(fabricsTable.isActive, true),
          ),
        )
        .orderBy(
          asc(productFabricOptionsTable.displayOrder),
          asc(manufacturersTable.name),
          asc(fabricsTable.name),
        ),
    ]);
    res.json({
      productId: product.id,
      frameOnlyPrice: product.frameOnlyPrice ?? null,
      variants: variantRows.map((v) => ({
        ...v,
        priceAdjustment: String(v.priceAdjustment ?? "0"),
      })),
      fabricOptions: fabricRows.map((f) => ({
        id: f.id,
        name: f.name,
        itemNumber: f.itemNumber,
        manufacturerName: f.manufacturerName,
        manufacturerLogoUrl: toPublicImageUrl(f.manufacturerLogoUrl),
        swatchImageUrl: toPublicImageUrl(f.swatchImageUrl),
        grade: f.grade,
        colorFamily: f.colorFamily,
        isStripe: f.isStripe,
        displayOrder: f.displayOrder,
      })),
    });
  },
);

router.put(
  "/admin/products/:id/inventory",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductInventoryParams.safeParse(req.params);
    const body = AdminUpdateProductInventoryBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [prevInv] = await db
      .select()
      .from(inventoryTable)
      .where(
        and(
          eq(inventoryTable.productId, product.id),
          sql`${inventoryTable.variantId} IS NULL`,
        ),
      );
    const [inv] = await db
      .insert(inventoryTable)
      .values({
        productId: product.id,
        onHand: body.data.onHand,
        onHold: 0,
        reorderThreshold: body.data.reorderThreshold,
      })
      .onConflictDoUpdate({
        target: [
          inventoryTable.productId,
          inventoryTable.variantId,
          inventoryTable.fabricId,
        ],
        set: {
          onHand: body.data.onHand,
          reorderThreshold: body.data.reorderThreshold,
          updatedAt: new Date(),
        },
      })
      .returning();
    await recordHistory(req, {
      entityType: "product",
      entityId: product.id,
      changeType: prevInv ? "update" : "create",
      snapshot: { inventory: inv },
      previousSnapshot: prevInv ? { inventory: prevInv } : undefined,
      notes: "inventory updated",
    });
    res.json({
      productId: product.id,
      onHand: inv.onHand,
      onHold: inv.onHold,
      reorderThreshold: inv.reorderThreshold,
    });
  },
);

export default router;
