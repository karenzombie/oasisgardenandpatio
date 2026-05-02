import { requestUploadUrl } from "@workspace/api-client-react";

/**
 * Upload a single file to object storage via presigned PUT URL.
 * Returns the canonical objectPath (e.g. `/objects/uploads/<uuid>`) which
 * should be stored in the database. To render the file later, prepend the
 * server's storage prefix (handled by `getStaffObjectUrl`).
 */
export async function uploadFile(file: File): Promise<{ objectPath: string }> {
  const { uploadURL, objectPath } = await requestUploadUrl({
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  });
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (HTTP ${putRes.status})`);
  }
  return { objectPath };
}

/**
 * Convert an `objectPath` returned by `uploadFile` into a URL the browser can
 * fetch. `objectPath` looks like `/objects/uploads/<uuid>`. The server serves
 * private objects at `/api/storage/objects/*`.
 */
export function getStaffObjectUrl(objectPath: string | null | undefined): string | undefined {
  if (!objectPath) return undefined;
  if (/^https?:\/\//.test(objectPath)) return objectPath;
  if (objectPath.startsWith("/objects/")) {
    return `/api/storage${objectPath}`;
  }
  return objectPath;
}
