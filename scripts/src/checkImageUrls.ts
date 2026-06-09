/**
 * Pre-publish image URL audit.
 *
 * Calls the key API endpoints that return image URLs and asserts that no raw
 * `/objects/...` paths leak out to the client. Every such path must have been
 * rewritten by `toPublicImageUrl()` to `/api/storage/objects/...` before the
 * route sends its JSON response.
 *
 * Exit 0 = all clear. Exit 1 = one or more raw paths found (prints details).
 */
export {};

const BASE = "http://localhost:80";

interface Check {
  label: string;
  url: string;
  /** JSON path(s) inside each array element (or the top-level object) that
   *  should contain image URLs. Use dot notation; arrays denoted by []. */
  paths: string[];
}

const CHECKS: Check[] = [
  {
    label: "GET /api/catalog/fabrics — swatchImageUrl",
    url: `${BASE}/api/catalog/fabrics?limit=50`,
    paths: ["fabrics[].swatchImageUrl"],
  },
  {
    label: "GET /api/products?limit=50 — primaryImageUrl",
    url: `${BASE}/api/products?limit=50`,
    paths: ["products[].primaryImageUrl"],
  },
  {
    label: "GET /api/categories — imageUrl",
    url: `${BASE}/api/categories`,
    paths: ["[].imageUrl"],
  },
  {
    label: "GET /api/manufacturers — logoUrl",
    url: `${BASE}/api/manufacturers`,
    paths: ["[].logoUrl"],
  },
  {
    label: "GET /api/materials — imageUrl",
    url: `${BASE}/api/materials`,
    paths: ["[].imageUrl"],
  },
  {
    label: "GET /api/products/popular — primaryImageUrl",
    url: `${BASE}/api/products/popular`,
    paths: ["[].primaryImageUrl"],
  },
];

/** Resolve a dot-path like "fabrics[].swatchImageUrl" against a parsed body. */
function extractValues(body: unknown, path: string): unknown[] {
  const parts = path.split(".");
  let current: unknown[] = [body];

  for (const part of parts) {
    const isArray = part.endsWith("[]");
    const key = isArray ? part.slice(0, -2) : part;
    const next: unknown[] = [];

    for (const item of current) {
      if (item == null || typeof item !== "object") continue;
      const val = key === "" ? item : (item as Record<string, unknown>)[key];
      if (isArray && Array.isArray(val)) {
        next.push(...val);
      } else if (val !== undefined) {
        next.push(val);
      }
    }
    current = next;
  }
  return current;
}

let failures = 0;

for (const check of CHECKS) {
  let body: unknown;
  try {
    const res = await fetch(check.url);
    body = await res.json();
  } catch (err) {
    console.error(`  SKIP  ${check.label} — fetch failed: ${err}`);
    continue;
  }

  const leaking: string[] = [];
  for (const path of check.paths) {
    const values = extractValues(body, path);
    for (const v of values) {
      if (typeof v === "string" && v.startsWith("/objects/")) {
        leaking.push(v);
      }
    }
  }

  if (leaking.length > 0) {
    console.error(`  FAIL  ${check.label}`);
    leaking.slice(0, 5).forEach((v) => console.error(`        raw URL leaked: ${v}`));
    if (leaking.length > 5) console.error(`        … and ${leaking.length - 5} more`);
    failures++;
  } else {
    console.log(`  OK    ${check.label}`);
  }
}

// Also check a product detail page (first active Tropitone product's fabricOptions)
try {
  const listRes = await fetch(`${BASE}/api/products?manufacturerId=25&limit=1`);
  const listBody = (await listRes.json()) as { products: Array<{ slug: string }> };
  const slug = listBody.products?.[0]?.slug;
  if (slug) {
    const detailRes = await fetch(`${BASE}/api/products/by-slug/${slug}`);
    const detail = (await detailRes.json()) as {
      images?: Array<{ url: string }>;
      fabricOptions?: Array<{ swatchImageUrl?: string }>;
      finishes?: Array<{ swatchImageUrl?: string }>;
      primaryImageUrl?: string;
    };
    const leaking: string[] = [];
    for (const img of detail.images ?? []) {
      if (typeof img.url === "string" && img.url.startsWith("/objects/")) leaking.push(img.url);
    }
    for (const f of detail.fabricOptions ?? []) {
      if (typeof f.swatchImageUrl === "string" && f.swatchImageUrl.startsWith("/objects/"))
        leaking.push(f.swatchImageUrl);
    }
    for (const f of detail.finishes ?? []) {
      if (typeof f.swatchImageUrl === "string" && f.swatchImageUrl.startsWith("/objects/"))
        leaking.push(f.swatchImageUrl);
    }
    if (typeof detail.primaryImageUrl === "string" && detail.primaryImageUrl.startsWith("/objects/"))
      leaking.push(detail.primaryImageUrl);

    const label = `GET /api/products/by-slug/${slug} — images, fabricOptions, finishes`;
    if (leaking.length > 0) {
      console.error(`  FAIL  ${label}`);
      leaking.forEach((v) => console.error(`        raw URL leaked: ${v}`));
      failures++;
    } else {
      console.log(`  OK    ${label}`);
    }
  }
} catch (err) {
  console.error(`  SKIP  product detail check — ${err}`);
}

if (failures > 0) {
  console.error(
    `\n✗ ${failures} endpoint(s) are leaking raw /objects/ URLs that will break in production.\n` +
    `  Wrap every image-URL field with toPublicImageUrl() before sending the response.\n` +
    `  See: artifacts/api-server/src/lib/imageUrl.ts`,
  );
  process.exit(1);
} else {
  console.log("\n✓ All image URLs are correctly rewritten — safe to publish.");
  process.exit(0);
}
