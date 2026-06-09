import { readFile } from "node:fs/promises";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadFile(
  localPath: string,
  subdir: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${subdir}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(localPath);
  const ct = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${subdir}/${filename}`;
}

const uploads = [
  {
    localPath:
      "/home/runner/workspace/attached_assets/rug_category_image_1781034417702.png",
    subdir: "categories",
    filename: "outdoor-rugs.png",
    categoryId: 50,
    categoryName: "Outdoor Rugs",
  },
  {
    localPath:
      "/home/runner/workspace/attached_assets/covers_category_image_1781034419670.png",
    subdir: "categories",
    filename: "protective-covers.png",
    categoryId: 51,
    categoryName: "Protective Covers",
  },
];

async function main() {
  for (const u of uploads) {
    const url = await uploadFile(u.localPath, u.subdir, u.filename);
    console.log(`Uploaded ${u.categoryName}: ${url}`);
    const [row] = await db
      .update(categoriesTable)
      .set({ imageUrl: url })
      .where(eq(categoriesTable.id, u.categoryId))
      .returning({ id: categoriesTable.id, name: categoriesTable.name });
    console.log(`Updated DB: ${row.id} = ${row.name}`);
  }
  console.log("Done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
