import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford";
const ROOT = join(import.meta.dirname, "../..");

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
  } as never,
  projectId: "",
});

function contentType(file: string): string {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function upload(absPath: string, storageFilename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageFilename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(absPath);
  await file.save(buffer, { contentType: contentType(absPath), resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageFilename}`;
}

// Only folders that map to existing Frankford umbrella products.
const PART1 = "frankford_umbrella_image_updated_6-16-26_part1";
const PART2 = "frankford_umbrella_images_updated_6-16-26_part2";

const FOLDERS: { dir: string; productIds: number[] }[] = [
  { dir: join(PART1, "aurora-cantilever"), productIds: [2299] },
  { dir: join(PART1, "catalina-fiberglass-patio"), productIds: [2301] },
  { dir: join(PART1, "eclipse-cantilever"), productIds: [2300] },
  { dir: join(PART2, "greenwich-aluminum-market"), productIds: [2293] },
  { dir: join(PART2, "greenwich-giant-market"), productIds: [2297] },
  { dir: join(PART2, "monterey-fiberglass-market"), productIds: [2294, 2295, 2296] },
  { dir: join(PART2, "monterey-giant-market"), productIds: [2298] },
];

const IMG_EXT = /\.(png|jpe?g|webp)$/i;

// Sort gallery files: headers first (by number), then lifestyle (by number),
// then everything else alphabetically.
function galleryRank(name: string): [number, number, string] {
  const lower = name.toLowerCase();
  const numMatch = lower.match(/(\d+)(?=\.\w+$)/);
  const num = numMatch ? Number(numMatch[1]) : 0;
  if (lower.includes("header")) return [0, num, lower];
  if (lower.includes("lifestyle")) return [1, num, lower];
  if (lower.includes("hero")) return [2, num, lower];
  return [3, num, lower];
}

async function main() {
  for (const f of FOLDERS) {
    const absDir = join(ROOT, f.dir);
    const allFiles = (await readdir(absDir)).filter((n) => IMG_EXT.test(n));
    const cardFile = allFiles.find((n) => n.toLowerCase().includes("product-card"));
    const galleryFiles = allFiles
      .filter((n) => n !== cardFile)
      .sort((a, b) => {
        const ra = galleryRank(a);
        const rb = galleryRank(b);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
      });

    if (!cardFile) {
      console.log(`  ⚠ ${f.dir}: no *-product-card image found; using first image as primary`);
    }
    const orderedForUpload = cardFile ? [cardFile, ...galleryFiles] : [...galleryFiles];
    const folderBase = basename(f.dir);

    // Upload each file once; collect resulting URLs in order.
    const urls: { url: string; file: string }[] = [];
    for (const file of orderedForUpload) {
      const url = await upload(join(absDir, file), `umbrella-updates/${folderBase}/${file}`);
      urls.push({ url, file });
    }

    for (const productId of f.productIds) {
      const [prod] = await db
        .select({ name: productsTable.name })
        .from(productsTable)
        .where(eq(productsTable.id, productId));
      const productName = prod?.name ?? `Product ${productId}`;

      // Demote any existing images: keep them as gallery, push to the back.
      await db
        .update(productImagesTable)
        .set({
          isPrimary: false,
          displayOrder: sql`${productImagesTable.displayOrder} + 100`,
        })
        .where(eq(productImagesTable.productId, productId));

      let order = 0;
      for (const { url, file } of urls) {
        const isCard = cardFile ? file === cardFile : order === 0;
        await db
          .insert(productImagesTable)
          .values({
            productId,
            variantId: null,
            url,
            altText: productName,
            displayOrder: order,
            isPrimary: isCard,
            imageKind: "gallery",
          })
          .onConflictDoNothing();
        order += 1;
      }
      console.log(`✓ ${productName} (#${productId}): ${urls.length} images (primary=${cardFile ?? orderedForUpload[0]})`);
    }
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
