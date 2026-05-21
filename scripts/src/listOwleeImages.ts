import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`, type: "external_account",
    credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;

// List everything under public/
const [publicFiles] = await storage.bucket(bucketId).getFiles({ prefix: "public/" });
console.log(`Files under public/: ${publicFiles.length}`);

// Show unique second-level folders
const subfolders = new Set(publicFiles.map(f => f.name.split("/").slice(0,2).join("/")));
console.log("Subfolders:", [...subfolders]);

// Show first 30
publicFiles.slice(0, 30).forEach(f => console.log(" ", f.name));
if (publicFiles.length > 30) console.log(`  ... and ${publicFiles.length - 30} more`);
