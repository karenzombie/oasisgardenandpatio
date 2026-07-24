/**
 * spaRoutes.ts
 *
 * Express handlers that serve the SPA shell (index.html) for known public
 * storefront document routes, with per-route SEO head tags injected.
 *
 * ALLOWLIST ONLY. Only the explicitly listed patterns are enriched; everything
 * else receives the plain, unmodified index.html. New routes must be
 * intentionally added — an allowlist fails safe whereas a blocklist would
 * silently enrich any future staff or internal route.
 *
 * Admin/staff paths (/admin/**, /agent/**, /staff/**) never reach these
 * handlers because the Replit proxy routes them to the web artifact, not the
 * API server. The only paths added to the API server's artifact.toml are the
 * known public storefront ones.
 */

import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { getIndexHtml, injectProductSeo } from "../lib/seoInjector";
import { logger } from "../lib/logger";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function sendHtml(res: Response, html: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

/** Serve the plain index.html with no enrichment. */
function serveRawHtml(req: Request, res: Response, next: NextFunction): void {
  try {
    sendHtml(res, getIndexHtml());
  } catch (err) {
    next(err);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
//
// Order matters: more-specific patterns must be registered before wildcards.
// /shop/category/:catSlug is registered before /shop/:slug so the literal
// "category" segment is never treated as a product slug.

// Gate 3 — category listing pages (plain shell for now; enriched in Gate 3)
router.get("/shop/category/:catSlug", serveRawHtml);

// Gate 2 — product detail pages (enriched SEO head)
router.get(
  "/shop/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const slug = String(req.params.slug ?? "").trim();
    try {
      const html = await injectProductSeo(slug, buildBaseUrl(req));
      sendHtml(res, html);
    } catch (err) {
      // Reaches here only when getIndexHtml() cannot read the file.
      logger.error({ err, slug }, "spaRoutes: /shop/:slug — could not serve HTML");
      next(err);
    }
  },
);

// Gate 3 — shop listing page (plain shell for now; enriched in Gate 3)
router.get("/shop", serveRawHtml);

// Catch-all: any other /shop/** path not matched above → plain shell (fail-safe)
// Express 5 requires a named wildcard param — bare * is rejected by path-to-regexp v8.
router.get("/shop/*splat", serveRawHtml);

export default router;
