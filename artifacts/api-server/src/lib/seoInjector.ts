/**
 * seoInjector.ts
 *
 * Server-side SEO head-tag injection for the Oasis storefront.
 *
 * Rules (non-negotiable per Gate 1-2 brief):
 * - ONLY enriches paths explicitly matched by spaRoutes.ts (allowlist-driven).
 * - catalog_visible=false OR is_active=false → noindex only, no enriched data.
 * - Unknown slug → plain shell, no injection, HTTP 200 (matches existing SPA behaviour).
 * - Any DB or file error → serve the plain, unmodified index.html (static fallback).
 * - Metadata is cached per slug with a 5-minute TTL.
 * - Never touches the page body, cart, checkout, pricing, or auth paths.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  categoriesTable,
  db,
  manufacturersTable,
  materialsTable,
  productImagesTable,
  productsTable,
} from "@workspace/db";
import { toPublicImageUrl } from "./imageUrl";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductMeta =
  | { type: "notfound"; cachedAt: number }
  | { type: "noindex"; cachedAt: number }
  | {
      type: "visible";
      name: string;
      description: string;
      relImageUrl: string | null;
      slug: string;
      cachedAt: number;
    };

type SimpleMeta =
  | { type: "notfound"; cachedAt: number }
  | { type: "found"; name: string; description: string | null; cachedAt: number };

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL

const productMetaCache = new Map<string, ProductMeta>();
const categoryMetaCache = new Map<string, SimpleMeta>();
const manufacturerMetaCache = new Map<string, SimpleMeta>();

// Materials: cache the entire slug→displayName map; reloaded after TTL.
let _materialMap: Map<string, string> | null = null;
let _materialMapLoadedAt = 0;

function isFresh(entry: { cachedAt: number }): boolean {
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

// ─── index.html template ──────────────────────────────────────────────────────

let _indexHtml: string | null = null;

/**
 * Read and in-process-cache the SPA shell index.html.
 * Dev  → reads artifacts/web/index.html (Vite source)
 * Prod → reads artifacts/web/dist/public/index.html (built output)
 * Throws if the file is missing; callers must handle with next(err).
 *
 * Path resolution: pnpm runs package scripts from the package directory
 * (artifacts/api-server), so process.cwd() is NOT the workspace root in dev.
 * We anchor to the bundle's own directory (dist/) and navigate up three levels
 * to the workspace root regardless of how the process was launched.
 */
function resolveWorkspaceRoot(): string {
  // In the esbuild ESM bundle, import.meta.url is the bundle file's URL.
  // The bundle lives at artifacts/api-server/dist/index.mjs, so going up
  // three levels (dist → api-server → artifacts → workspace) reliably gives
  // the workspace root in every launch context.
  try {
    const bundleDir = dirname(fileURLToPath(import.meta.url));
    return resolve(bundleDir, "../../..");
  } catch {
    // Fallback: if import.meta.url is unavailable, try process.cwd() variants.
    const cwd = process.cwd();
    // Try workspace-root-relative first, then package-dir-relative.
    if (existsSync(resolve(cwd, "artifacts/web/index.html"))) return cwd;
    return resolve(cwd, "../..");
  }
}

export function getIndexHtml(): string {
  if (_indexHtml !== null) return _indexHtml;
  const isDev = process.env["NODE_ENV"] !== "production";
  const root = resolveWorkspaceRoot();
  const htmlPath = isDev
    ? resolve(root, "artifacts/web/index.html")
    : resolve(root, "artifacts/web/dist/public/index.html");
  _indexHtml = readFileSync(htmlPath, "utf-8");
  return _indexHtml;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/** Escape a value for safe use in HTML attribute values and element text. */
function esc(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Strip HTML tags and collapse runs of whitespace. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Convert a slug to a display name (title-case fallback for unknown slugs). */
function formatSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Build the ≤160-char meta description using the brief's priority order:
 * 1. short_description (trimmed plain text)
 * 2. description (first ~160 chars of plain text)
 * 3. Template: name + brand/collection + category
 */
function buildDescription(p: {
  shortDescription: string | null;
  description: string | null;
  name: string;
  collection: string | null;
  categoryName: string | null;
  manufacturerName: string | null;
}): string {
  const MAX = 160;
  if (p.shortDescription?.trim()) {
    return stripHtml(p.shortDescription.trim()).slice(0, MAX);
  }
  if (p.description?.trim()) {
    return stripHtml(p.description.trim()).slice(0, MAX);
  }
  const parts: string[] = [p.name];
  if (p.manufacturerName && p.collection) {
    parts.push(`from ${p.manufacturerName}'s ${p.collection} collection`);
  } else if (p.manufacturerName) {
    parts.push(`by ${p.manufacturerName}`);
  }
  parts.push(
    p.categoryName
      ? `${p.categoryName} at Oasis Garden & Patio`
      : "outdoor furniture at Oasis Garden & Patio",
  );
  return parts.join(". ").slice(0, MAX);
}

// ─── DB lookups ───────────────────────────────────────────────────────────────

async function queryProductMeta(slug: string): Promise<ProductMeta> {
  const [row] = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      shortDescription: productsTable.shortDescription,
      description: productsTable.description,
      collection: productsTable.collection,
      isActive: productsTable.isActive,
      catalogVisible: productsTable.catalogVisible,
      categoryName: categoriesTable.name,
      manufacturerName: manufacturersTable.name,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .where(eq(productsTable.slug, slug))
    .limit(1);

  if (!row) {
    return { type: "notfound", cachedAt: Date.now() };
  }

  if (!row.isActive || !row.catalogVisible) {
    return { type: "noindex", cachedAt: Date.now() };
  }

  // Primary gallery image — mirrors the by-slug route's selection logic
  const [imgRow] = await db
    .select({ url: productImagesTable.url })
    .from(productImagesTable)
    .where(
      and(
        eq(productImagesTable.productId, row.id),
        eq(productImagesTable.imageKind, "gallery"),
      ),
    )
    .orderBy(
      desc(productImagesTable.isPrimary),
      asc(productImagesTable.displayOrder),
      asc(productImagesTable.id),
    )
    .limit(1);

  const description = buildDescription({
    shortDescription: row.shortDescription ?? null,
    description: row.description ?? null,
    name: row.name,
    collection: row.collection ?? null,
    categoryName: row.categoryName ?? null,
    manufacturerName: row.manufacturerName ?? null,
  });

  return {
    type: "visible",
    name: row.name,
    description,
    relImageUrl: imgRow?.url ?? null,
    slug,
    cachedAt: Date.now(),
  };
}

async function queryCategoryMeta(slug: string): Promise<SimpleMeta> {
  const [row] = await db
    .select({ name: categoriesTable.name, description: categoriesTable.description })
    .from(categoriesTable)
    .where(
      and(eq(categoriesTable.slug, slug), eq(categoriesTable.isActive, true)),
    )
    .limit(1);
  if (!row) return { type: "notfound", cachedAt: Date.now() };
  return {
    type: "found",
    name: row.name,
    description: row.description ?? null,
    cachedAt: Date.now(),
  };
}

async function queryManufacturerMeta(slug: string): Promise<SimpleMeta> {
  const [row] = await db
    .select({
      name: manufacturersTable.name,
      description: manufacturersTable.description,
    })
    .from(manufacturersTable)
    .where(
      and(
        eq(manufacturersTable.slug, slug),
        eq(manufacturersTable.isActive, true),
      ),
    )
    .limit(1);
  if (!row) return { type: "notfound", cachedAt: Date.now() };
  return {
    type: "found",
    name: row.name,
    description: row.description ?? null,
    cachedAt: Date.now(),
  };
}

/** Return the slug→displayName map for all materials, cached for 5 minutes. */
async function getMaterialMap(): Promise<Map<string, string>> {
  if (_materialMap && Date.now() - _materialMapLoadedAt < CACHE_TTL_MS) {
    return _materialMap;
  }
  const rows = await db
    .select({ slug: materialsTable.slug, name: materialsTable.name })
    .from(materialsTable);
  _materialMap = new Map(rows.map((r) => [r.slug, r.name]));
  _materialMapLoadedAt = Date.now();
  return _materialMap;
}

// ─── Shop canonical computation ───────────────────────────────────────────────

const SHOP_FACETS = ["material", "category", "manufacturer"] as const;

/**
 * Compute the canonical URL for a /shop (listing) request.
 *
 * Rules (Option C from brief):
 * 1. No facets                → /shop
 * 2. Exactly one facet        → /shop?{facet}={value}  (page always stripped)
 * 3. Two or more facets       → /shop
 *
 * Unknown / tracking params are ignored for canonical purposes.
 */
function computeShopCanonical(baseUrl: string, params: URLSearchParams): string {
  const active = SHOP_FACETS.filter((f) => {
    const v = params.get(f);
    return v !== null && v !== "";
  });
  if (active.length === 0) return `${baseUrl}/shop`;
  if (active.length === 1) {
    const [f] = active;
    return `${baseUrl}/shop?${f}=${encodeURIComponent(params.get(f)!)}`;
  }
  return `${baseUrl}/shop`;
}

// ─── Head tag builders ────────────────────────────────────────────────────────

function buildNoindexTag(): string {
  return `    <meta name="robots" content="noindex" data-ssr="1">`;
}

function buildProductTags(
  meta: ProductMeta & { type: "visible" },
  baseUrl: string,
): { newTitle: string; extraTags: string } {
  const title = esc(`${meta.name} | Oasis Garden & Patio`);
  const desc = esc(meta.description);
  const canonical = esc(`${baseUrl}/shop/${meta.slug}`);
  const relImg = meta.relImageUrl ? toPublicImageUrl(meta.relImageUrl) : null;
  const ogImage = relImg ? esc(`${baseUrl}${relImg}`) : null;

  const tags: string[] = [
    `    <meta name="description" content="${desc}" data-ssr="1">`,
    `    <link rel="canonical" href="${canonical}" data-ssr="1">`,
    `    <meta property="og:type" content="product" data-ssr="1">`,
    `    <meta property="og:title" content="${title}" data-ssr="1">`,
    `    <meta property="og:description" content="${desc}" data-ssr="1">`,
    `    <meta property="og:url" content="${canonical}" data-ssr="1">`,
  ];
  if (ogImage) {
    tags.push(`    <meta property="og:image" content="${ogImage}" data-ssr="1">`);
  }

  return { newTitle: title, extraTags: tags.join("\n") };
}

function buildListTags(opts: {
  title: string;
  description: string;
  canonical: string;
}): { newTitle: string; extraTags: string } {
  const title = esc(opts.title);
  const desc = esc(opts.description);
  const canonical = esc(opts.canonical);

  const tags: string[] = [
    `    <meta name="description" content="${desc}" data-ssr="1">`,
    `    <link rel="canonical" href="${canonical}" data-ssr="1">`,
    `    <meta property="og:type" content="website" data-ssr="1">`,
    `    <meta property="og:title" content="${title}" data-ssr="1">`,
    `    <meta property="og:description" content="${desc}" data-ssr="1">`,
    `    <meta property="og:url" content="${canonical}" data-ssr="1">`,
  ];

  return { newTitle: title, extraTags: tags.join("\n") };
}

// ─── Template injection ───────────────────────────────────────────────────────

/**
 * Modify the first <title>…</title> found in the HTML template:
 * - If newTitle is provided, replace the title text AND append afterTitleTags.
 * - If newTitle is null, keep the original title AND append afterTitleTags.
 */
function injectIntoTemplate(
  html: string,
  newTitle: string | null,
  afterTitleTags: string,
): string {
  const TITLE_RE = /<title>[^<]*<\/title>/;
  if (newTitle !== null) {
    return html.replace(
      TITLE_RE,
      `<title data-ssr="1">${newTitle}</title>\n${afterTitleTags}`,
    );
  }
  return html.replace(TITLE_RE, `$&\n${afterTitleTags}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return index.html with per-product SEO head tags injected.
 *
 * - Visible product  → enriched title + description + canonical + OG tags.
 * - Noindex product  → <meta name="robots" content="noindex">, generic title.
 * - Unknown slug     → plain index.html, no injection (SPA renders 404 client-side).
 * - Any DB failure   → plain index.html (static fallback, never blocks the page).
 *
 * @throws Only if getIndexHtml() fails (missing build output). Callers should
 *         catch and call next(err) so the Express error handler responds.
 */
export async function injectProductSeo(
  slug: string,
  baseUrl: string,
): Promise<string> {
  const template = getIndexHtml(); // may throw; caller is responsible

  try {
    let meta = productMetaCache.get(slug);
    if (!meta || !isFresh(meta)) {
      meta = await queryProductMeta(slug);
      productMetaCache.set(slug, meta);
    }

    switch (meta.type) {
      case "notfound":
        return template;

      case "noindex":
        return injectIntoTemplate(template, null, buildNoindexTag());

      case "visible": {
        const { newTitle, extraTags } = buildProductTags(meta, baseUrl);
        return injectIntoTemplate(template, newTitle, extraTags);
      }
    }
  } catch (err) {
    logger.error(
      { err, slug },
      "seoInjector: product metadata lookup failed — serving plain index.html",
    );
    return template; // static fallback
  }
}

/**
 * Return index.html with SEO tags for /shop and /shop?{facet}={value} URLs.
 *
 * Canonical rules (Option C):
 * - No facets            → canonical /shop
 * - One facet, no page   → canonical /shop?{facet}={value}  (page always stripped)
 * - Multi-facet          → canonical /shop
 *
 * Title/description always reflect the actual facet shown, regardless of
 * whether the canonical points elsewhere.
 */
export async function injectShopSeo(
  rawQueryString: string,
  baseUrl: string,
): Promise<string> {
  const template = getIndexHtml();

  try {
    const params = new URLSearchParams(rawQueryString);
    const canonical = computeShopCanonical(baseUrl, params);

    const materialSlug = params.get("material") ?? "";
    const categorySlug = params.get("category") ?? "";
    const manufacturerSlug = params.get("manufacturer") ?? "";
    const activeFacetCount = [materialSlug, categorySlug, manufacturerSlug].filter(
      Boolean,
    ).length;

    let title: string;
    let description: string;

    if (activeFacetCount === 0) {
      title = "Shop Outdoor Patio Furniture | Oasis Garden & Patio";
      description =
        "Shop our full collection of luxury outdoor patio furniture at Oasis Garden & Patio. Dining sets, deep seating, umbrellas, and more.";
    } else if (activeFacetCount > 1) {
      // Multi-facet: title describes what the user sees; canonical → /shop
      title = "Outdoor Patio Furniture | Oasis Garden & Patio";
      description =
        "Shop outdoor patio furniture collections at Oasis Garden & Patio.";
    } else if (materialSlug) {
      const matMap = await getMaterialMap();
      const displayName = matMap.get(materialSlug) ?? formatSlug(materialSlug);
      title = `${displayName} Outdoor Patio Furniture | Oasis Garden & Patio`;
      description = `Shop our collection of ${displayName} outdoor patio furniture at Oasis Garden & Patio.`;
    } else if (categorySlug) {
      let catMeta = categoryMetaCache.get(categorySlug);
      if (!catMeta || !isFresh(catMeta)) {
        catMeta = await queryCategoryMeta(categorySlug);
        categoryMetaCache.set(categorySlug, catMeta);
      }
      if (catMeta.type === "notfound") return template;
      title = `${catMeta.name} Outdoor Furniture | Oasis Garden & Patio`;
      description = catMeta.description
        ? stripHtml(catMeta.description).slice(0, 160)
        : `Shop ${catMeta.name} outdoor furniture at Oasis Garden & Patio.`;
    } else {
      // manufacturerSlug
      let mfrMeta = manufacturerMetaCache.get(manufacturerSlug);
      if (!mfrMeta || !isFresh(mfrMeta)) {
        mfrMeta = await queryManufacturerMeta(manufacturerSlug);
        manufacturerMetaCache.set(manufacturerSlug, mfrMeta);
      }
      if (mfrMeta.type === "notfound") return template;
      title = `${mfrMeta.name} Patio Furniture | Oasis Garden & Patio`;
      description = mfrMeta.description
        ? stripHtml(mfrMeta.description).slice(0, 160)
        : `Shop ${mfrMeta.name} outdoor patio furniture at Oasis Garden & Patio.`;
    }

    const { newTitle, extraTags } = buildListTags({ title, description, canonical });
    return injectIntoTemplate(template, newTitle, extraTags);
  } catch (err) {
    logger.error(
      { err, rawQueryString },
      "seoInjector: /shop metadata lookup failed — serving plain index.html",
    );
    return template;
  }
}

/**
 * Return index.html with SEO tags for /shop/category/:catSlug.
 * Unknown or inactive category → plain shell (SPA renders 404 client-side).
 */
export async function injectCategorySeo(
  catSlug: string,
  baseUrl: string,
): Promise<string> {
  const template = getIndexHtml();

  try {
    let meta = categoryMetaCache.get(catSlug);
    if (!meta || !isFresh(meta)) {
      meta = await queryCategoryMeta(catSlug);
      categoryMetaCache.set(catSlug, meta);
    }
    if (meta.type === "notfound") return template;

    const canonical = `${baseUrl}/shop/category/${catSlug}`;
    const title = `${meta.name} Outdoor Furniture | Oasis Garden & Patio`;
    const description = meta.description
      ? stripHtml(meta.description).slice(0, 160)
      : `Shop ${meta.name} outdoor furniture at Oasis Garden & Patio.`;

    const { newTitle, extraTags } = buildListTags({ title, description, canonical });
    return injectIntoTemplate(template, newTitle, extraTags);
  } catch (err) {
    logger.error(
      { err, catSlug },
      "seoInjector: /shop/category lookup failed — serving plain index.html",
    );
    return template;
  }
}

/**
 * Return index.html with SEO tags for /manufacturers/:slug.
 * Unknown or inactive manufacturer → plain shell.
 */
export async function injectManufacturerSeo(
  slug: string,
  baseUrl: string,
): Promise<string> {
  const template = getIndexHtml();

  try {
    let meta = manufacturerMetaCache.get(slug);
    if (!meta || !isFresh(meta)) {
      meta = await queryManufacturerMeta(slug);
      manufacturerMetaCache.set(slug, meta);
    }
    if (meta.type === "notfound") return template;

    const canonical = `${baseUrl}/manufacturers/${slug}`;
    const title = `${meta.name} Patio Furniture | Oasis Garden & Patio`;
    const description = meta.description
      ? stripHtml(meta.description).slice(0, 160)
      : `Shop ${meta.name} outdoor patio furniture at Oasis Garden & Patio.`;

    const { newTitle, extraTags } = buildListTags({ title, description, canonical });
    return injectIntoTemplate(template, newTitle, extraTags);
  } catch (err) {
    logger.error(
      { err, slug },
      "seoInjector: /manufacturers lookup failed — serving plain index.html",
    );
    return template;
  }
}
