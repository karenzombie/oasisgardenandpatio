import { useEffect, useLayoutEffect } from "react";

interface SeoProps {
  /**
   * Full page title including the " | Oasis Garden & Patio" suffix.
   * Pass an empty string while data is loading — the hook is a no-op until
   * a non-empty title is available, which prevents a flash of the wrong title.
   */
  title: string;
  description: string;
  /** Absolute canonical URL, e.g. "https://example.com/shop/my-product". */
  canonical?: string;
  ogType?: "website" | "product";
  /** Absolute OG image URL. Pass null/undefined to remove the tag. */
  ogImageUrl?: string | null;
  noindex?: boolean;
}

/** Find an existing head tag by CSS selector, or create and append one. */
function getOrCreate(
  selector: string,
  tagName: string,
  initAttrs: Record<string, string>,
): Element {
  const existing = document.head.querySelector(selector);
  if (existing) return existing;
  const el = document.createElement(tagName);
  for (const [k, v] of Object.entries(initAttrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
  return el;
}

/**
 * Client-side SEO hook.
 *
 * On first mount it removes all server-injected [data-ssr] head tags before
 * paint so this hook owns the head from that point on. This guarantees that
 * after hydration there is exactly one <title> and one <meta name="description">
 * in the document at all times — no duplicates.
 */
export function useSEO({
  title,
  description,
  canonical,
  ogType = "website",
  ogImageUrl,
  noindex = false,
}: SeoProps) {
  useLayoutEffect(() => {
    document.head.querySelectorAll("[data-ssr]").forEach((el) => el.remove());
  }, []);

  useEffect(() => {
    if (!title) return;

    document.title = title;

    getOrCreate('meta[name="description"]', "meta", {
      name: "description",
    }).setAttribute("content", description);

    if (noindex) {
      getOrCreate('meta[name="robots"]', "meta", {
        name: "robots",
      }).setAttribute("content", "noindex");
    } else {
      document.head.querySelector('meta[name="robots"]')?.remove();
    }

    if (canonical) {
      getOrCreate('link[rel="canonical"]', "link", {
        rel: "canonical",
      }).setAttribute("href", canonical);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    }

    getOrCreate('meta[property="og:type"]', "meta", {
      property: "og:type",
    }).setAttribute("content", ogType);

    getOrCreate('meta[property="og:title"]', "meta", {
      property: "og:title",
    }).setAttribute("content", title);

    getOrCreate('meta[property="og:description"]', "meta", {
      property: "og:description",
    }).setAttribute("content", description);

    if (canonical) {
      getOrCreate('meta[property="og:url"]', "meta", {
        property: "og:url",
      }).setAttribute("content", canonical);
    } else {
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }

    if (ogImageUrl) {
      getOrCreate('meta[property="og:image"]', "meta", {
        property: "og:image",
      }).setAttribute("content", ogImageUrl);
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove();
    }
  }, [title, description, canonical, ogType, ogImageUrl, noindex]);
}
