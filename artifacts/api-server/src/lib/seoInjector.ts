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

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL

const productMetaCache = new Map<string, ProductMeta>();

function isFresh(entry: ProductMeta): boolean {
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

// ─── DB lookup ────────────────────────────────────────────────────────────────

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

// ─── Head tag builders ────────────────────────────────────────────────────────

function buildNoindexTag(): string {
  return `    <meta name="robots" content="noindex">`;
}

function buildEnrichedTags(
  meta: ProductMeta & { type: "visible" },
  baseUrl: string,
): { newTitle: string; extraTags: string } {
  const title = esc(`${meta.name} | Oasis Garden & Patio`);
  const desc = esc(meta.description);
  const canonical = esc(`${baseUrl}/shop/${meta.slug}`);
  const relImg = meta.relImageUrl ? toPublicImageUrl(meta.relImageUrl) : null;
  const ogImage = relImg ? esc(`${baseUrl}${relImg}`) : null;

  const tags: string[] = [
    `    <meta name="description" content="${desc}">`,
    `    <link rel="canonical" href="${canonical}">`,
    `    <meta property="og:type" content="product">`,
    `    <meta property="og:title" content="${title}">`,
    `    <meta property="og:description" content="${desc}">`,
    `    <meta property="og:url" content="${canonical}">`,
  ];
  if (ogImage) {
    tags.push(`    <meta property="og:image" content="${ogImage}">`);
  }

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
  const TITLE_RE = /(<title>)[^<]*(<\/title>)/;
  if (newTitle !== null) {
    return html.replace(TITLE_RE, `$1${newTitle}$2\n${afterTitleTags}`);
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
        const { newTitle, extraTags } = buildEnrichedTags(meta, baseUrl);
        return injectIntoTemplate(template, newTitle, extraTags);
      }
    }
  } catch (err) {
    logger.error(
      { err, slug },
      "seoInjector: metadata lookup failed — serving plain index.html",
    );
    return template; // static fallback
  }
}
