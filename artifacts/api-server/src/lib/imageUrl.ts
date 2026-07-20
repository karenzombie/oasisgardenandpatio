/**
 * Object-storage paths are persisted in the database as their canonical
 * internal id (e.g. `/objects/vendor-imports/foo.png`). The HTTP route
 * that actually serves these bytes is mounted at `/api/storage/objects/*`
 * on the API server. This helper rewrites a stored URL into the public
 * URL the browser must request.
 *
 * Already-absolute URLs and any other path shape are returned unchanged.
 */
export function toPublicImageUrl<T extends string | null | undefined>(
  url: T,
): T {
  if (!url) return url;
  if (typeof url !== "string") return url;
  if (url.startsWith("/objects/") || url.startsWith("/public-objects/")) {
    return ("/api/storage" + url) as T;
  }
  return url;
}
