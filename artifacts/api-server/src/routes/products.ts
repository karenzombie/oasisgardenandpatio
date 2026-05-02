import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
  materialsTable,
} from "@workspace/db";
import {
  ListFeaturedProductsResponse,
  ListCatalogProductsQueryParams,
  ListCatalogProductsResponse,
  GetCatalogProductBySlugResponse,
} from "@workspace/api-zod";

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
      showPriceOnline: productsTable.showPriceOnline,
      availableOnline: productsTable.availableOnline,
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
      and(eq(productsTable.isActive, true), eq(productsTable.featured, true)),
    )
    .orderBy(
      sql`${productsTable.displayOrder} asc`,
      sql`${productsTable.name} asc`,
    )
    .limit(12);

  const normalized = rows.map((r) => ({
    ...r,
    manufacturerName: r.manufacturerName ?? "",
    categoryName: r.categoryName ?? "",
  }));

  res.json(ListFeaturedProductsResponse.parse(normalized));
});

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
      sort,
      page,
      pageSize,
    } = parsed.data;

    const conditions = [
      eq(productsTable.isActive, true),
      eq(productsTable.availableOnline, true),
    ];
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      conditions.push(
        // narrow `or(...)` result; drizzle types accept SQL chunks here.
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
      conditions.push(ilike(materialsTable.slug, materialSlug));
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
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        showPriceOnline: productsTable.showPriceOnline,
        availableOnline: productsTable.availableOnline,
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
      )
      .leftJoin(
        materialsTable,
        eq(materialsTable.id, productsTable.materialId),
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
      .leftJoin(
        materialsTable,
        eq(materialsTable.id, productsTable.materialId),
      )
      .where(whereClause);

    const [rows, totalResult] = await Promise.all([rowsP, totalP]);
    res.json(
      ListCatalogProductsResponse.parse({
        products: rows,
        total: totalResult[0]?.count ?? 0,
        page,
        pageSize,
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
        manufacturerName: manufacturersTable.name,
        manufacturerSlug: manufacturersTable.slug,
        categoryName: categoriesTable.name,
        categorySlug: categoriesTable.slug,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        weight: productsTable.weight,
        dimensions: productsTable.dimensions,
        specs: productsTable.specs,
        tags: productsTable.tags,
        showPriceOnline: productsTable.showPriceOnline,
        availableOnline: productsTable.availableOnline,
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

    const tagsArray: string[] = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const specsObj: Record<string, unknown> | null =
      row.specs && typeof row.specs === "object" && !Array.isArray(row.specs)
        ? (row.specs as Record<string, unknown>)
        : null;

    const payload = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      description: row.description,
      shortDescription: row.shortDescription,
      manufacturerName: row.manufacturerName,
      manufacturerSlug: row.manufacturerSlug,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      price: row.price,
      salePrice: row.salePrice,
      weight: row.weight,
      dimensions: row.dimensions,
      specs: specsObj,
      tags: tagsArray,
      showPriceOnline: row.showPriceOnline,
      availableOnline: row.availableOnline,
      featured: row.featured,
      primaryImageUrl: primaryGallery?.url ?? null,
      images,
    };

    res.json(GetCatalogProductBySlugResponse.parse(payload));
  },
);

export default router;
