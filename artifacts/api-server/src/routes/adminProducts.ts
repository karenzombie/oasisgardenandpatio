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
  productMaterialsTable,
  variantGradePricesTable,
  finishesTable,
  productFinishPoolsTable,
  productFinishOptionsTable,
  productFinialOptionsTable,
  productStemOptionsTable,
  productCoverOptionsTable,
  productCoverFinishPricesTable,
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
  primaryImageUrl: string | null;
  imageCount: number;
  onHand: number;
};

type MaterialPayload = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
};

/**
 * Derive a URL-safe collection slug from the free-form `collection` value.
 * Staff never type this; it is generated server-side on every save.
 */
function slugifyCollection(value: string | null | undefined): string | null {
  if (value == null) return null;
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? null : slug;
}

/**
 * Load the materials linked to each product via the product_materials
 * junction, keyed by productId and ordered by the link's displayOrder.
 */
async function loadMaterialsMap(
  productIds: number[],
): Promise<Map<number, MaterialPayload[]>> {
  const map = new Map<number, MaterialPayload[]>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({
      productId: productMaterialsTable.productId,
      id: materialsTable.id,
      name: materialsTable.name,
      slug: materialsTable.slug,
      description: materialsTable.description,
      imageUrl: materialsTable.imageUrl,
      displayOrder: materialsTable.displayOrder,
    })
    .from(productMaterialsTable)
    .innerJoin(
      materialsTable,
      eq(materialsTable.id, productMaterialsTable.materialId),
    )
    .where(inArray(productMaterialsTable.productId, productIds))
    .orderBy(
      asc(productMaterialsTable.displayOrder),
      asc(materialsTable.name),
    );
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      imageUrl: toPublicImageUrl(r.imageUrl),
      displayOrder: r.displayOrder,
    });
    map.set(r.productId, list);
  }
  return map;
}

function toAdminPayload(r: ProductRow, materials: MaterialPayload[]) {
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
    materials,
    collection: r.collection,
    collectionSlug: r.collectionSlug,
    subCategory: r.subCategory,
    subMaterial: r.subMaterial,
    seatType: r.seatType,
    umbrellaType: r.umbrellaType,
    umbrellaShape: r.umbrellaShape,
    umbrellaSize: r.umbrellaSize,
    liftMechanism: r.liftMechanism,
    tiltMechanism: r.tiltMechanism,
    poleMaterial: r.poleMaterial,
    hasLedLighting: r.hasLedLighting ?? false,
    isCommercialGrade: r.isCommercialGrade ?? false,
    price: r.price,
    salePrice: r.salePrice,
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
    finishMinQtyNote: r.finishMinQtyNote,
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
      collection: productsTable.collection,
      collectionSlug: productsTable.collectionSlug,
      subCategory: productsTable.subCategory,
      subMaterial: productsTable.subMaterial,
      seatType: productsTable.seatType,
      umbrellaType: productsTable.umbrellaType,
      umbrellaShape: productsTable.umbrellaShape,
      umbrellaSize: productsTable.umbrellaSize,
      liftMechanism: productsTable.liftMechanism,
      tiltMechanism: productsTable.tiltMechanism,
      poleMaterial: productsTable.poleMaterial,
      hasLedLighting: productsTable.hasLedLighting,
      isCommercialGrade: productsTable.isCommercialGrade,
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
      featuredAt: productsTable.featuredAt,
      displayOrder: productsTable.displayOrder,
      lowStockThreshold: productsTable.lowStockThreshold,
      finishMinQtyNote: productsTable.finishMinQtyNote,
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
    );
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
  materialIds?: number[];
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
  if (input.materialIds && input.materialIds.length > 0) {
    const uniqueIds = [...new Set(input.materialIds)];
    const found = await db
      .select({ id: materialsTable.id })
      .from(materialsTable)
      .where(inArray(materialsTable.id, uniqueIds));
    if (found.length !== uniqueIds.length) {
      return "One or more materials do not exist";
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
      .where(whereClause as ReturnType<typeof and>);

    const [rows, totalResult] = await Promise.all([rowsP, totalP]);
    const materialsMap = await loadMaterialsMap(rows.map((r) => r.id));
    res.json({
      products: rows.map((r) => toAdminPayload(r, materialsMap.get(r.id) ?? [])),
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
    const materialsMap = await loadMaterialsMap([row.id]);
    res.json({
      ...toAdminPayload(row, materialsMap.get(row.id) ?? []),
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
    const materialIds = [...new Set(parsed.data.materialIds ?? [])];
    try {
      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(productsTable)
          .values({
            name: parsed.data.name,
            slug: parsed.data.slug,
            sku: parsed.data.sku,
            description: parsed.data.description ?? null,
            shortDescription: parsed.data.shortDescription ?? null,
            manufacturerId: parsed.data.manufacturerId ?? null,
            categoryId: parsed.data.categoryId ?? null,
            collection: parsed.data.collection ?? null,
            collectionSlug: slugifyCollection(parsed.data.collection),
            subCategory: parsed.data.subCategory ?? null,
            subMaterial: parsed.data.subMaterial ?? null,
            seatType: parsed.data.seatType ?? null,
            umbrellaType: parsed.data.umbrellaType ?? null,
            umbrellaShape: parsed.data.umbrellaShape ?? null,
            umbrellaSize: parsed.data.umbrellaSize ?? null,
            liftMechanism: parsed.data.liftMechanism ?? null,
            tiltMechanism: parsed.data.tiltMechanism ?? null,
            poleMaterial: parsed.data.poleMaterial ?? null,
            hasLedLighting: parsed.data.hasLedLighting ?? false,
            isCommercialGrade: parsed.data.isCommercialGrade ?? false,
            price: parsed.data.price ?? null,
            salePrice: parsed.data.salePrice ?? null,
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
            featuredAt: parsed.data.featured ? new Date() : null,
            displayOrder: parsed.data.displayOrder ?? 0,
            lowStockThreshold: parsed.data.lowStockThreshold ?? 0,
            isActive: parsed.data.isActive ?? true,
          })
          .returning();
        if (materialIds.length > 0) {
          await tx.insert(productMaterialsTable).values(
            materialIds.map((materialId, i) => ({
              productId: created.id,
              materialId,
              displayOrder: i,
            })),
          );
        }
        return created;
      });
      // Seed inventory row (best-effort; ignore conflict)
      await db
        .insert(inventoryTable)
        .values({ productId: row.id, onHand: 0, onHold: 0, reorderThreshold: 0 })
        .onConflictDoNothing();

      const full = await loadProductById(row.id);
      const materialsMap = await loadMaterialsMap([row.id]);
      await recordHistory(req, {
        entityType: "product",
        entityId: row.id,
        changeType: "create",
        snapshot: full,
      });
      res
        .status(201)
        .json(toAdminPayload(full!, materialsMap.get(row.id) ?? []));
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
      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(productsTable)
          .set({
            name: body.data.name,
            slug: body.data.slug,
            sku: body.data.sku,
            description: body.data.description ?? null,
            shortDescription: body.data.shortDescription ?? null,
            manufacturerId: body.data.manufacturerId ?? null,
            categoryId: body.data.categoryId ?? null,
            collection: body.data.collection ?? null,
            collectionSlug: slugifyCollection(body.data.collection),
            subCategory: body.data.subCategory ?? null,
            subMaterial: body.data.subMaterial ?? null,
            seatType: body.data.seatType ?? null,
            umbrellaType: body.data.umbrellaType ?? null,
            umbrellaShape: body.data.umbrellaShape ?? null,
            umbrellaSize: body.data.umbrellaSize ?? null,
            liftMechanism: body.data.liftMechanism ?? null,
            tiltMechanism: body.data.tiltMechanism ?? null,
            poleMaterial: body.data.poleMaterial ?? null,
            ...(body.data.hasLedLighting !== undefined
              ? { hasLedLighting: body.data.hasLedLighting }
              : {}),
            ...(body.data.isCommercialGrade !== undefined
              ? { isCommercialGrade: body.data.isCommercialGrade }
              : {}),
            price: body.data.price ?? null,
            salePrice: body.data.salePrice ?? null,
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
              ? {
                  featured: body.data.featured,
                  featuredAt: body.data.featured
                    ? sql`COALESCE(${productsTable.featuredAt}, now())`
                    : null,
                }
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
            ...(body.data.finishMinQtyNote !== undefined
              ? { finishMinQtyNote: body.data.finishMinQtyNote }
              : {}),
          })
          .where(eq(productsTable.id, params.data.id))
          .returning();
        if (!updated) return null;
        // When materialIds is provided, it replaces the product's material set.
        if (body.data.materialIds !== undefined) {
          await tx
            .delete(productMaterialsTable)
            .where(eq(productMaterialsTable.productId, params.data.id));
          const uniqueIds = [...new Set(body.data.materialIds)];
          if (uniqueIds.length > 0) {
            await tx.insert(productMaterialsTable).values(
              uniqueIds.map((materialId, i) => ({
                productId: params.data.id,
                materialId,
                displayOrder: i,
              })),
            );
          }
        }
        return updated;
      });
      if (!row) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      const full = await loadProductById(row.id);
      const materialsMap = await loadMaterialsMap([row.id]);
      await recordHistory(req, {
        entityType: "product",
        entityId: row.id,
        changeType: "update",
        snapshot: full,
        previousSnapshot: previous,
      });
      res.json(toAdminPayload(full!, materialsMap.get(row.id) ?? []));
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
    const materialsMap = await loadMaterialsMap([row.id]);
    await recordHistory(req, {
      entityType: "product",
      entityId: row.id,
      changeType: "update",
      snapshot: full,
      previousSnapshot: previous,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(toAdminPayload(full!, materialsMap.get(row.id) ?? []));
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
      .select({
        id: productsTable.id,
        frameOnlyPrice: productsTable.frameOnlyPrice,
        manufacturerId: productsTable.manufacturerId,
      })
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
          notes: productVariantsTable.notes,
          minOrderQty: productVariantsTable.minOrderQty,
          excludeStripeFabrics: productVariantsTable.excludeStripeFabrics,
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

    // Per-variant grade prices (grade-mode products). Empty for legacy TG-style.
    const variantIds = variantRows.map((v) => v.id);
    const gradePriceRows = variantIds.length
      ? await db
          .select({
            variantId: variantGradePricesTable.variantId,
            grade: variantGradePricesTable.grade,
            msrp: variantGradePricesTable.msrp,
            salePrice: variantGradePricesTable.salePrice,
          })
          .from(variantGradePricesTable)
          .where(inArray(variantGradePricesTable.variantId, variantIds))
          .orderBy(asc(variantGradePricesTable.grade))
      : [];
    const gradePricesByVariant = new Map<
      number,
      Array<{ grade: string; msrp: string; salePrice: string | null }>
    >();
    for (const gp of gradePriceRows) {
      const list = gradePricesByVariant.get(gp.variantId) ?? [];
      list.push({ grade: gp.grade, msrp: gp.msrp, salePrice: gp.salePrice });
      gradePricesByVariant.set(gp.variantId, list);
    }

    // Discrete frame-finish choices: UNION of pool-expanded manufacturer
    // finishes and individually-picked finish options (mirrors detail route).
    const poolMfrRows = await db
      .select({ manufacturerId: productFinishPoolsTable.manufacturerId })
      .from(productFinishPoolsTable)
      .where(eq(productFinishPoolsTable.productId, product.id));
    const poolMfrIds = poolMfrRows.map((p) => p.manufacturerId);
    const pooledFinishRows = poolMfrIds.length
      ? await db
          .select({
            id: finishesTable.id,
            code: finishesTable.itemNumber,
            name: finishesTable.name,
            imageUrl: finishesTable.imageUrl,
            description: finishesTable.description,
            displayOrder: finishesTable.displayOrder,
          })
          .from(finishesTable)
          .where(
            and(
              inArray(finishesTable.manufacturerId, poolMfrIds),
              eq(finishesTable.isActive, true),
            ),
          )
      : [];
    const optionFinishRows = await db
      .select({
        id: finishesTable.id,
        code: finishesTable.itemNumber,
        name: finishesTable.name,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        displayOrder: productFinishOptionsTable.displayOrder,
        upchargeMsrp: productFinishOptionsTable.upchargeMsrp,
        upchargeSale: productFinishOptionsTable.upchargeSale,
        minOrderQty: productFinishOptionsTable.minOrderQty,
      })
      .from(productFinishOptionsTable)
      .innerJoin(
        finishesTable,
        eq(finishesTable.id, productFinishOptionsTable.finishId),
      )
      .where(
        and(
          eq(productFinishOptionsTable.productId, product.id),
          eq(finishesTable.isActive, true),
        ),
      );
    const finishByIdMap = new Map<
      number,
      {
        id: number;
        code: string | null;
        name: string;
        imageUrl: string | null;
        description: string | null;
        displayOrder: number;
        upchargeMsrp: string;
        upchargeSale: string;
        minOrderQty: number | null;
      }
    >();
    // Explicitly-picked options carry per-product frame upcharges and win over
    // pooled finishes (which never carry an upcharge) when a finish appears in
    // both sets. Mirrors the customer by-slug route.
    for (const f of optionFinishRows) {
      if (!finishByIdMap.has(f.id)) finishByIdMap.set(f.id, f);
    }
    for (const f of pooledFinishRows) {
      if (!finishByIdMap.has(f.id))
        finishByIdMap.set(f.id, {
          ...f,
          upchargeMsrp: "0",
          upchargeSale: "0",
          minOrderQty: null,
        });
    }
    const discreteFinishes = [...finishByIdMap.values()].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );

    // Optional galvanized-base accessories — mirror the customer by-slug route
    // so the staff order builder surfaces the exact same Stem + Aluminum Top
    // Cover pickers. Only the 7 galvanized plate bases have any rows here;
    // every other product resolves to [] / null.
    const stemOptionRows = await db
      .select({
        stemProductId: productStemOptionsTable.stemProductId,
        displayOrder: productStemOptionsTable.displayOrder,
        sku: productsTable.sku,
        name: productsTable.name,
        slug: productsTable.slug,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        primaryImageUrl: sql<string | null>`(
          select ${productImagesTable.url}
          from ${productImagesTable}
          where ${productImagesTable.productId} = ${productStemOptionsTable.stemProductId}
            and ${productImagesTable.imageKind} = 'gallery'
          order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
          limit 1
        )`,
      })
      .from(productStemOptionsTable)
      .innerJoin(
        productsTable,
        eq(productsTable.id, productStemOptionsTable.stemProductId),
      )
      .where(
        and(
          eq(productStemOptionsTable.baseProductId, product.id),
          eq(productsTable.isActive, true),
        ),
      )
      .orderBy(
        asc(productStemOptionsTable.displayOrder),
        asc(productsTable.name),
      );
    const stemOptions = stemOptionRows.map((s) => {
      const sale =
        s.salePrice != null && Number(s.salePrice) > 0 ? s.salePrice : null;
      const unitPrice = sale ?? (s.price != null ? s.price : "0");
      return {
        stemProductId: s.stemProductId,
        sku: s.sku,
        name: s.name,
        slug: s.slug,
        imageUrl: toPublicImageUrl(s.primaryImageUrl),
        msrp: s.price == null ? null : String(s.price),
        salePrice: sale == null ? null : String(sale),
        unitPrice: String(unitPrice),
      };
    });

    const [coverOptionRow] = await db
      .select({
        coverProductId: productCoverOptionsTable.coverProductId,
        sku: productsTable.sku,
        name: productsTable.name,
        primaryImageUrl: sql<string | null>`(
          select ${productImagesTable.url}
          from ${productImagesTable}
          where ${productImagesTable.productId} = ${productCoverOptionsTable.coverProductId}
            and ${productImagesTable.imageKind} = 'gallery'
          order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
          limit 1
        )`,
      })
      .from(productCoverOptionsTable)
      .innerJoin(
        productsTable,
        eq(productsTable.id, productCoverOptionsTable.coverProductId),
      )
      .where(eq(productCoverOptionsTable.baseProductId, product.id))
      .limit(1);

    let coverOptions: {
      coverProductId: number;
      sku: string;
      label: string;
      imageUrl: string | null;
      finishes: {
        finishId: number;
        finishCode: string | null;
        finishName: string;
        swatchImageUrl: string | null;
        msrp: string;
        salePrice: string;
        unitPrice: string;
      }[];
    } | null = null;
    if (coverOptionRow) {
      const coverFinishRows = await db
        .select({
          finishId: productCoverFinishPricesTable.finishId,
          finishCode: finishesTable.itemNumber,
          finishName: finishesTable.name,
          swatchImageUrl: finishesTable.imageUrl,
          msrp: productCoverFinishPricesTable.msrp,
          salePrice: productCoverFinishPricesTable.salePrice,
          displayOrder: productCoverFinishPricesTable.displayOrder,
        })
        .from(productCoverFinishPricesTable)
        .innerJoin(
          finishesTable,
          eq(finishesTable.id, productCoverFinishPricesTable.finishId),
        )
        .where(
          eq(
            productCoverFinishPricesTable.coverProductId,
            coverOptionRow.coverProductId,
          ),
        )
        .orderBy(
          asc(productCoverFinishPricesTable.displayOrder),
          asc(finishesTable.name),
        );
      coverOptions = {
        coverProductId: coverOptionRow.coverProductId,
        sku: coverOptionRow.sku,
        label: coverOptionRow.name,
        imageUrl: toPublicImageUrl(coverOptionRow.primaryImageUrl),
        finishes: coverFinishRows.map((f) => {
          const sale = Number(f.salePrice) > 0 ? String(f.salePrice) : null;
          const unitPrice = sale ?? String(f.msrp);
          return {
            finishId: f.finishId,
            finishCode: f.finishCode ?? null,
            finishName: f.finishName,
            swatchImageUrl: toPublicImageUrl(f.swatchImageUrl),
            msrp: String(f.msrp),
            salePrice: String(f.salePrice),
            unitPrice,
          };
        }),
      };
    }

    const finialRows = await db
      .select({
        id: productFinialOptionsTable.id,
        code: productFinialOptionsTable.code,
        name: productFinialOptionsTable.name,
        isDefault: productFinialOptionsTable.isDefault,
        upchargeMsrp: productFinialOptionsTable.upchargeMsrp,
        upchargeSale: productFinialOptionsTable.upchargeSale,
        displayOrder: productFinialOptionsTable.displayOrder,
      })
      .from(productFinialOptionsTable)
      .where(
        and(
          eq(productFinialOptionsTable.productId, product.id),
          eq(productFinialOptionsTable.isActive, true),
        ),
      )
      .orderBy(
        asc(productFinialOptionsTable.displayOrder),
        asc(productFinialOptionsTable.name),
      );

    res.json({
      productId: product.id,
      frameOnlyPrice: product.frameOnlyPrice ?? null,
      stemOptions,
      coverOptions,
      finialOptions: finialRows.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        isDefault: f.isDefault,
        upchargeMsrp: String(f.upchargeMsrp ?? "0"),
        upchargeSale: String(f.upchargeSale ?? "0"),
        displayOrder: f.displayOrder,
      })),
      variants: variantRows.map((v) => ({
        ...v,
        priceAdjustment: String(v.priceAdjustment ?? "0"),
        gradePrices: gradePricesByVariant.get(v.id) ?? [],
        notes: v.notes ?? null,
        minOrderQty: v.minOrderQty ?? null,
        excludeStripeFabrics: v.excludeStripeFabrics ?? false,
      })),
      finishes: discreteFinishes.map((f) => ({
        id: f.id,
        code: f.code ?? "",
        name: f.name,
        description: f.description ?? null,
        swatchImageUrl: toPublicImageUrl(f.imageUrl),
        displayOrder: f.displayOrder,
        upchargeMsrp: String(f.upchargeMsrp ?? "0"),
        upchargeSale: String(f.upchargeSale ?? "0"),
        minOrderQty: f.minOrderQty ?? null,
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
