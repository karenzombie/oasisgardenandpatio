import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, exists, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
  materialsTable,
  productMaterialsTable,
  productVariantsTable,
  productFabricOptionsTable,
  fabricsTable,
  finishCollectionsTable,
  finishesTable,
  variantGradePricesTable,
  productFinishPoolsTable,
  productFinishOptionsTable,
  productRecommendationsTable,
} from "@workspace/db";
import {
  ListFeaturedProductsResponse,
  ListProductRecommendationsResponse,
  ListCatalogProductsQueryParams,
  ListCatalogProductsResponse,
  ListCatalogCollectionsQueryParams,
  ListCatalogFacetsQueryParams,
  ListCatalogFacetsResponse,
  GetCatalogProductBySlugResponse,
} from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";
import { computeStartingPrices } from "../lib/startingPrices";

const router: IRouter = Router();

router.get("/products/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      manufacturerName: manufacturersTable.name,
      categoryName: categoriesTable.name,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
      showPriceOnline: productsTable.showPriceOnline,
      availableOnline: productsTable.availableOnline,
      quoteOnly: productsTable.quoteOnly,
      primaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
        order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
        limit 1
      )`,
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
    .where(
      and(
        eq(productsTable.isActive, true),
        eq(productsTable.availableOnline, true),
        eq(productsTable.featured, true),
      ),
    )
    .orderBy(
      sql`${productsTable.featuredAt} desc nulls last`,
      sql`${productsTable.displayOrder} asc`,
      sql`${productsTable.name} asc`,
    )
    .limit(12);

  const startingMap = await computeStartingPrices(rows.map((r) => r.id));
  const normalized = rows.map((r) => {
    const starting = startingMap.get(r.id);
    return {
      ...r,
      manufacturerName: r.manufacturerName ?? "",
      categoryName: r.categoryName ?? "",
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
      salePrice: r.salePrice,
      priceVaries: starting?.priceVaries ?? false,
      startingPrice: starting?.startingPrice ?? null,
      startingSalePrice: starting?.startingSalePrice ?? null,
    };
  });

  res.json(ListFeaturedProductsResponse.parse(normalized));
});

// Compatible Recommendations for a product detail page. Generic + data-driven:
// the mapping lives in `product_recommendations` (source SKU -> compatible SKU)
// and is extended by adding rows, not code. The governing rule for the whole
// feature is online availability — we only return compatible items whose
// product is active AND availableOnline, so a not-yet-online (or not-yet-
// created) SKU in the mapping simply stays hidden. Recommended pick sorts
// first; the caller renders nothing when the array is empty.
router.get(
  "/products/:sku/recommendations",
  async (req: Request, res: Response): Promise<void> => {
    const sku = String(req.params.sku ?? "").trim();
    const rows = await db
      .select({
        id: productsTable.id,
        sku: productsTable.sku,
        name: productsTable.name,
        slug: productsTable.slug,
        weight: productsTable.weight,
        isRecommended: productRecommendationsTable.isRecommended,
        displayOrder: productRecommendationsTable.displayOrder,
        primaryImageUrl: sql<string | null>`(
          select ${productImagesTable.url}
          from ${productImagesTable}
          where ${productImagesTable.productId} = ${productsTable.id}
          order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
          limit 1
        )`,
      })
      .from(productRecommendationsTable)
      .innerJoin(
        productsTable,
        eq(productsTable.sku, productRecommendationsTable.compatibleSku),
      )
      .where(
        and(
          eq(productRecommendationsTable.sourceSku, sku),
          eq(productsTable.isActive, true),
          eq(productsTable.availableOnline, true),
        ),
      )
      .orderBy(
        desc(productRecommendationsTable.isRecommended),
        asc(productRecommendationsTable.displayOrder),
        asc(productsTable.name),
      );

    const normalized = rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      slug: r.slug,
      weight: r.weight,
      isRecommended: r.isRecommended,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
    }));

    res.json(ListProductRecommendationsResponse.parse(normalized));
  },
);

// Public catalog listing. Filters/joins by manufacturer/category/material
// SLUG (not id) so the customer URLs stay clean and can be deep-linked.
router.get(
  "/products",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ListCatalogProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const {
      q,
      categorySlug,
      manufacturerSlug,
      materialSlug,
      collection,
      subCategory,
      onlineOnly,
      sort,
      page,
      pageSize,
    } = parsed.data;

    const conditions = [
      eq(productsTable.isActive, true),
      eq(productsTable.availableOnline, true),
    ];
    if (onlineOnly) {
      conditions.push(eq(productsTable.quoteOnly, false));
      conditions.push(eq(productsTable.inStoreOnly, false));
    }
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(productsTable.name, needle),
          ilike(productsTable.sku, needle),
          ilike(productsTable.shortDescription, needle),
        )!,
      );
    }
    if (manufacturerSlug) {
      conditions.push(ilike(manufacturersTable.slug, manufacturerSlug));
    }
    if (categorySlug) {
      conditions.push(ilike(categoriesTable.slug, categorySlug));
    }
    if (materialSlug) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(productMaterialsTable)
            .innerJoin(
              materialsTable,
              eq(materialsTable.id, productMaterialsTable.materialId),
            )
            .where(
              and(
                eq(productMaterialsTable.productId, productsTable.id),
                ilike(materialsTable.slug, materialSlug),
              ),
            ),
        ),
      );
    }
    if (collection && collection.trim()) {
      conditions.push(eq(productsTable.collection, collection.trim()));
    }
    if (subCategory && subCategory.trim()) {
      conditions.push(eq(productsTable.subCategory, subCategory.trim()));
    }
    const whereClause = and(...conditions);

    // Effective price for sorting: COALESCE(sale_price, price)
    const effectivePrice = sql<string>`COALESCE(${productsTable.salePrice}, ${productsTable.price})`;
    const orderBy = (() => {
      switch (sort) {
        case "price_asc":
          return [asc(effectivePrice), asc(productsTable.name)];
        case "price_desc":
          return [desc(effectivePrice), asc(productsTable.name)];
        case "name_asc":
          return [asc(productsTable.name)];
        case "newest":
          return [desc(productsTable.createdAt), asc(productsTable.name)];
        case "featured":
        default:
          return [
            desc(productsTable.featured),
            asc(productsTable.displayOrder),
            asc(productsTable.name),
          ];
      }
    })();

    const offset = (page - 1) * pageSize;

    const baseFrom = db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        slug: productsTable.slug,
        sku: productsTable.sku,
        shortDescription: productsTable.shortDescription,
        manufacturerName: manufacturersTable.name,
        manufacturerSlug: manufacturersTable.slug,
        categoryName: categoriesTable.name,
        categorySlug: categoriesTable.slug,
        collection: productsTable.collection,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        showPriceOnline: productsTable.showPriceOnline,
        availableOnline: productsTable.availableOnline,
        quoteOnly: productsTable.quoteOnly,
        featured: productsTable.featured,
        primaryImageUrl: sql<string | null>`(
          select ${productImagesTable.url}
          from ${productImagesTable}
          where ${productImagesTable.productId} = ${productsTable.id}
            and ${productImagesTable.imageKind} = 'gallery'
          order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
          limit 1
        )`,
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

    const rowsP = baseFrom
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset);

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
      .where(whereClause);

    const [rows, totalResult] = await Promise.all([rowsP, totalP]);
    const startingMap = await computeStartingPrices(rows.map((r) => r.id));
    res.json(
      ListCatalogProductsResponse.parse({
        products: rows.map((r) => {
          const starting = startingMap.get(r.id);
          return {
            ...r,
            primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
            priceVaries: starting?.priceVaries ?? false,
            startingPrice: starting?.startingPrice ?? null,
            startingSalePrice: starting?.startingSalePrice ?? null,
          };
        }),
        total: totalResult[0]?.count ?? 0,
        page,
        pageSize,
      }),
    );
  },
);

// Public: distinct product collection names (for shop filter), optionally
// scoped to a manufacturer. The global set is very large, so the storefront
// only requests this once a manufacturer is selected.
router.get(
  "/catalog/collections",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ListCatalogCollectionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const { manufacturerSlug } = parsed.data;

    const conditions = [
      eq(productsTable.isActive, true),
      eq(productsTable.availableOnline, true),
      sql`${productsTable.collection} is not null`,
      sql`${productsTable.collection} <> ''`,
    ];
    if (manufacturerSlug) {
      conditions.push(ilike(manufacturersTable.slug, manufacturerSlug));
    }

    const rows = await db
      .selectDistinct({ collection: productsTable.collection })
      .from(productsTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productsTable.manufacturerId),
      )
      .where(and(...conditions))
      .orderBy(productsTable.collection);

    res.json(rows.map((r) => r.collection).filter((c): c is string => !!c));
  },
);

// Public: dynamic filter facets. For each facet we return the option values that
// yield at least one product given every OTHER active filter (standard faceted
// search: a facet never constrains itself, so the user can still switch between
// values within it while zero-result options stay hidden). Options are derived
// live from catalog data, so they adapt automatically as the catalog changes.
router.get(
  "/catalog/facets",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ListCatalogFacetsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const {
      q,
      categorySlug,
      manufacturerSlug,
      materialSlug,
      collection,
      subCategory,
      onlineOnly,
    } = parsed.data;

    // Build the product-match conditions for a given subset of active filters.
    // `exclude` names the facet whose own selection must be ignored so that
    // facet's available options aren't collapsed to the single chosen value.
    type Facet =
      | "category"
      | "manufacturer"
      | "material"
      | "collection"
      | "subCategory";
    const buildConditions = (exclude: Facet | null) => {
      const conds = [
        eq(productsTable.isActive, true),
        eq(productsTable.availableOnline, true),
      ];
      if (onlineOnly) {
        conds.push(eq(productsTable.quoteOnly, false));
        conds.push(eq(productsTable.inStoreOnly, false));
      }
      if (q && q.trim()) {
        const needle = `%${q.trim()}%`;
        conds.push(
          or(
            ilike(productsTable.name, needle),
            ilike(productsTable.sku, needle),
            ilike(productsTable.shortDescription, needle),
          )!,
        );
      }
      if (manufacturerSlug && exclude !== "manufacturer") {
        conds.push(ilike(manufacturersTable.slug, manufacturerSlug));
      }
      if (categorySlug && exclude !== "category") {
        conds.push(ilike(categoriesTable.slug, categorySlug));
      }
      if (materialSlug && exclude !== "material") {
        conds.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(productMaterialsTable)
              .innerJoin(
                materialsTable,
                eq(materialsTable.id, productMaterialsTable.materialId),
              )
              .where(
                and(
                  eq(productMaterialsTable.productId, productsTable.id),
                  ilike(materialsTable.slug, materialSlug),
                  eq(materialsTable.isActive, true),
                ),
              ),
          ),
        );
      }
      if (collection && collection.trim() && exclude !== "collection") {
        conds.push(eq(productsTable.collection, collection.trim()));
      }
      if (subCategory && subCategory.trim() && exclude !== "subCategory") {
        conds.push(eq(productsTable.subCategory, subCategory.trim()));
      }
      return conds;
    };

    const withJoins = <T extends ReturnType<typeof db.select>>(qb: T) =>
      qb
        .from(productsTable)
        .leftJoin(
          manufacturersTable,
          eq(manufacturersTable.id, productsTable.manufacturerId),
        )
        .leftJoin(
          categoriesTable,
          eq(categoriesTable.id, productsTable.categoryId),
        );

    const [
      categoryRows,
      manufacturerRows,
      materialRows,
      collectionRows,
      subCategoryRows,
    ] = await Promise.all([
        withJoins(
          db.selectDistinct({
            slug: categoriesTable.slug,
            name: categoriesTable.name,
            displayOrder: categoriesTable.displayOrder,
          }),
        )
          .where(
            and(
              ...buildConditions("category"),
              eq(categoriesTable.isActive, true),
              sql`${categoriesTable.slug} is not null`,
            ),
          )
          .orderBy(categoriesTable.displayOrder, categoriesTable.name),
        withJoins(
          db.selectDistinct({
            slug: manufacturersTable.slug,
            name: manufacturersTable.name,
          }),
        )
          .where(
            and(
              ...buildConditions("manufacturer"),
              eq(manufacturersTable.isActive, true),
              ne(manufacturersTable.slug, "andrew-sewing"),
              sql`${manufacturersTable.slug} is not null`,
            ),
          )
          .orderBy(manufacturersTable.name),
        // Materials of products matching the other facets, via the junction.
        db
          .selectDistinct({
            slug: materialsTable.slug,
            name: materialsTable.name,
          })
          .from(materialsTable)
          .innerJoin(
            productMaterialsTable,
            eq(productMaterialsTable.materialId, materialsTable.id),
          )
          .innerJoin(
            productsTable,
            eq(productsTable.id, productMaterialsTable.productId),
          )
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, productsTable.manufacturerId),
          )
          .leftJoin(
            categoriesTable,
            eq(categoriesTable.id, productsTable.categoryId),
          )
          .where(and(...buildConditions("material"), eq(materialsTable.isActive, true)))
          .orderBy(materialsTable.name),
        withJoins(
          db.selectDistinct({ collection: productsTable.collection }),
        )
          .where(
            and(
              ...buildConditions("collection"),
              sql`${productsTable.collection} is not null`,
              sql`${productsTable.collection} <> ''`,
            ),
          )
          .orderBy(productsTable.collection),
        // Sub-categories of products matching the other facets. Scoped to the
        // selected category (buildConditions keeps categorySlug), so the
        // storefront only surfaces values relevant to the chosen category.
        withJoins(
          db.selectDistinct({ subCategory: productsTable.subCategory }),
        )
          .where(
            and(
              ...buildConditions("subCategory"),
              sql`${productsTable.subCategory} is not null`,
              sql`${productsTable.subCategory} <> ''`,
            ),
          )
          .orderBy(productsTable.subCategory),
      ]);

    res.json(
      ListCatalogFacetsResponse.parse({
        categories: categoryRows
          .filter((r) => r.slug != null)
          .map((r) => ({ slug: r.slug as string, name: r.name as string })),
        manufacturers: manufacturerRows
          .filter((r) => r.slug != null)
          .map((r) => ({ slug: r.slug as string, name: r.name as string })),
        materials: materialRows.map((r) => ({ slug: r.slug, name: r.name })),
        collections: collectionRows
          .map((r) => r.collection)
          .filter((c): c is string => !!c),
        subCategories: subCategoryRows
          .map((r) => r.subCategory)
          .filter((c): c is string => !!c),
      }),
    );
  },
);

// Public PDP payload by slug. Returns product + manufacturer/category names
// and slugs + full image set + specs/tags.
router.get(
  "/products/by-slug/:slug",
  async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug ?? "").trim();
    if (!slug) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const [row] = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        slug: productsTable.slug,
        sku: productsTable.sku,
        description: productsTable.description,
        shortDescription: productsTable.shortDescription,
        manufacturerId: productsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        manufacturerSlug: manufacturersTable.slug,
        categoryName: categoriesTable.name,
        categorySlug: categoriesTable.slug,
        collection: productsTable.collection,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        frameOnlyPrice: productsTable.frameOnlyPrice,
        weight: productsTable.weight,
        dimensions: productsTable.dimensions,
        specs: productsTable.specs,
        tags: productsTable.tags,
        showPriceOnline: productsTable.showPriceOnline,
        availableOnline: productsTable.availableOnline,
        quoteOnly: productsTable.quoteOnly,
        featured: productsTable.featured,
        isActive: productsTable.isActive,
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
      .where(eq(productsTable.slug, slug))
      .limit(1);

    // Public PDP must match PLP visibility: only show active products that
    // are flagged for online catalog. Otherwise direct-link access could
    // expose hidden/in-store-only items.
    if (!row || !row.isActive || !row.availableOnline) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const images = await db
      .select({
        id: productImagesTable.id,
        url: productImagesTable.url,
        altText: productImagesTable.altText,
        isPrimary: productImagesTable.isPrimary,
        displayOrder: productImagesTable.displayOrder,
        imageKind: productImagesTable.imageKind,
      })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, row.id))
      .orderBy(
        desc(productImagesTable.isPrimary),
        asc(productImagesTable.displayOrder),
        asc(productImagesTable.id),
      );

    const primaryGallery =
      images.find((i) => i.imageKind === "gallery" && i.isPrimary) ??
      images.find((i) => i.imageKind === "gallery") ??
      null;

    // Materials associated via the product_materials junction, ordered by the
    // junction's displayOrder so the PDP renders them in the curated order.
    const materialRows = await db
      .select({
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
      .where(eq(productMaterialsTable.productId, row.id))
      .orderBy(
        asc(productMaterialsTable.displayOrder),
        asc(materialsTable.name),
      );

    const variantRows = await db
      .select({
        id: productVariantsTable.id,
        sku: productVariantsTable.variantSku,
        name: productVariantsTable.variantName,
        optionLabel: productVariantsTable.optionLabel,
        priceAdjustment: productVariantsTable.priceAdjustment,
        msrp: productVariantsTable.msrp,
        salePrice: productVariantsTable.salePrice,
        shippingSurcharge: productVariantsTable.shippingSurcharge,
        weight: productVariantsTable.weight,
        dimensions: productVariantsTable.dimensions,
        displayOrder: productVariantsTable.displayOrder,
        notes: productVariantsTable.notes,
        minOrderQty: productVariantsTable.minOrderQty,
        excludeStripeFabrics: productVariantsTable.excludeStripeFabrics,
      })
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.productId, row.id),
          eq(productVariantsTable.isActive, true),
        ),
      )
      .orderBy(
        asc(productVariantsTable.displayOrder),
        asc(productVariantsTable.variantName),
      );

    // Per-grade pricing for grade-priced products (e.g. Frankford). Empty for
    // legacy products; presence of any rows puts the PDP in 3-step grade mode.
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
      { grade: string; msrp: string; salePrice: string }[]
    >();
    for (const gp of gradePriceRows) {
      const list = gradePricesByVariant.get(gp.variantId) ?? [];
      list.push({
        grade: gp.grade,
        msrp: String(gp.msrp),
        salePrice: String(gp.salePrice),
      });
      gradePricesByVariant.set(gp.variantId, list);
    }

    // Finishes (frame finish swatches) are a separate catalog entity with their
    // own swatch images. Product variants store the finish only as a plain text
    // name (e.g. "Bronze"), so we match by manufacturer + name to recover the
    // swatch image. Build a case-insensitive name -> imageUrl lookup.
    const finishRows = row.manufacturerId
      ? await db
          .select({
            name: finishesTable.name,
            imageUrl: finishesTable.imageUrl,
            collection: finishesTable.collection,
          })
          .from(finishesTable)
          .where(
            and(
              eq(finishesTable.manufacturerId, row.manufacturerId),
              eq(finishesTable.isActive, true),
            ),
          )
          .orderBy(asc(finishesTable.displayOrder), asc(finishesTable.id))
      : [];

    const finishDataByName = new Map<string, { imageUrl: string | null; collection: string | null }>();
    for (const f of finishRows) {
      const key = f.name.trim().toLowerCase();
      // Keep the first (lowest display order) entry for a given name.
      if (!finishDataByName.has(key)) {
        finishDataByName.set(key, { imageUrl: f.imageUrl, collection: f.collection });
      }
    }

    const finishCollectionRows = row.manufacturerId
      ? await db
          .select({
            id: finishCollectionsTable.id,
            manufacturerId: finishCollectionsTable.manufacturerId,
            collectionName: finishCollectionsTable.collectionName,
            panelImageUrl: finishCollectionsTable.panelImageUrl,
            displayOrder: finishCollectionsTable.displayOrder,
          })
          .from(finishCollectionsTable)
          .where(
            and(
              eq(finishCollectionsTable.manufacturerId, row.manufacturerId),
              eq(finishCollectionsTable.isActive, true),
            ),
          )
          .orderBy(asc(finishCollectionsTable.displayOrder))
      : [];

    // Discrete frame-finish choices for grade-priced products. The effective
    // set is the UNION of pool-expanded manufacturer finishes (every active
    // finish from a pooled manufacturer) and individually-picked finish
    // options. Legacy products carry neither, so this resolves to [].
    const poolMfrRows = await db
      .select({ manufacturerId: productFinishPoolsTable.manufacturerId })
      .from(productFinishPoolsTable)
      .where(eq(productFinishPoolsTable.productId, row.id));
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
      })
      .from(productFinishOptionsTable)
      .innerJoin(
        finishesTable,
        eq(finishesTable.id, productFinishOptionsTable.finishId),
      )
      .where(
        and(
          eq(productFinishOptionsTable.productId, row.id),
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
      }
    >();
    // Explicitly-picked options carry per-product frame upcharges and win over
    // pooled finishes (which never carry an upcharge) when a finish appears in
    // both sets.
    for (const f of optionFinishRows) {
      if (!finishByIdMap.has(f.id)) finishByIdMap.set(f.id, f);
    }
    for (const f of pooledFinishRows) {
      if (!finishByIdMap.has(f.id))
        finishByIdMap.set(f.id, {
          ...f,
          upchargeMsrp: "0",
          upchargeSale: "0",
        });
    }
    const discreteFinishes = [...finishByIdMap.values()].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );

    const fabricRows = await db
      .select({
        id: fabricsTable.id,
        name: fabricsTable.name,
        itemNumber: fabricsTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        manufacturerLogoUrl: manufacturersTable.logoUrl,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        grade: fabricsTable.grade,
        colorFamily: fabricsTable.colorFamily,
        notes: fabricsTable.notes,
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
          eq(productFabricOptionsTable.productId, row.id),
          eq(fabricsTable.isActive, true),
        ),
      )
      .orderBy(
        asc(productFabricOptionsTable.displayOrder),
        asc(manufacturersTable.name),
        asc(fabricsTable.name),
      );

    const tagsArray: string[] = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const specsObj: Record<string, unknown> | null =
      row.specs && typeof row.specs === "object" && !Array.isArray(row.specs)
        ? (row.specs as Record<string, unknown>)
        : null;

    const starting = (await computeStartingPrices([row.id])).get(row.id);

    const payload = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      description: row.description,
      materials: materialRows.map((m) => ({
        ...m,
        imageUrl: toPublicImageUrl(m.imageUrl),
      })),
      shortDescription: row.shortDescription,
      manufacturerName: row.manufacturerName,
      manufacturerSlug: row.manufacturerSlug,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      collection: row.collection,
      price: row.price,
      salePrice: row.salePrice,
      priceVaries: starting?.priceVaries ?? false,
      startingPrice: starting?.startingPrice ?? null,
      startingSalePrice: starting?.startingSalePrice ?? null,
      frameOnlyPrice: row.frameOnlyPrice ?? null,
      weight: row.weight,
      dimensions: row.dimensions,
      specs: specsObj,
      tags: tagsArray,
      showPriceOnline: row.showPriceOnline,
      availableOnline: row.availableOnline,
      quoteOnly: row.quoteOnly,
      featured: row.featured,
      primaryImageUrl: toPublicImageUrl(primaryGallery?.url ?? null),
      images: images.map((i) => ({ ...i, url: toPublicImageUrl(i.url) })),
      variants: variantRows.map((v) => {
        // Wind-vent variants store the finish plus a vent suffix in their name
        // (e.g. "Silver Shadow – Single Wind Vent"). Strip that suffix so the
        // frame-finish swatch lookup still matches the plain finish name.
        const finishLookupName = v.name
          .replace(
            /\s*(?:[–—-]\s*(?:Single|Double)\s+Wind\s+Vent|\((?:SWV|DWV)\))\s*$/i,
            "",
          )
          .trim()
          .toLowerCase();
        const finishData = finishDataByName.get(finishLookupName);
        return {
          ...v,
          priceAdjustment: String(v.priceAdjustment ?? "0"),
          msrp: v.msrp == null ? null : String(v.msrp),
          salePrice: v.salePrice == null ? null : String(v.salePrice),
          shippingSurcharge: String(v.shippingSurcharge ?? "0"),
          weight: v.weight == null ? null : String(v.weight),
          dimensions: v.dimensions ?? null,
          swatchImageUrl: toPublicImageUrl(finishData?.imageUrl ?? null),
          collection: finishData?.collection ?? null,
          gradePrices: gradePricesByVariant.get(v.id) ?? [],
          notes: v.notes ?? null,
          minOrderQty: v.minOrderQty ?? null,
          excludeStripeFabrics: v.excludeStripeFabrics ?? false,
        };
      }),
      finishes: discreteFinishes.map((f) => ({
        id: f.id,
        code: f.code ?? "",
        name: f.name,
        description: f.description ?? null,
        swatchImageUrl: toPublicImageUrl(f.imageUrl),
        displayOrder: f.displayOrder,
        upchargeMsrp: String(f.upchargeMsrp ?? "0"),
        upchargeSale: String(f.upchargeSale ?? "0"),
      })),
      finishCollections: finishCollectionRows.map((fc) => ({
        ...fc,
        panelImageUrl: toPublicImageUrl(fc.panelImageUrl),
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
        notes: f.notes,
        isStripe: f.isStripe,
        displayOrder: f.displayOrder,
      })),
    };

    res.json(GetCatalogProductBySlugResponse.parse(payload));
  },
);

export default router;
