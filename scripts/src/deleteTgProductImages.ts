import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorage = new Storage({
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
  },
  projectId: "",
});

function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function main() {
  const { bucket: bucketName, prefix } = parsePrivateDir();
  const folder = prefix ? `${prefix}/vendor-imports/` : "vendor-imports/";
  const bucket = objectStorage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: folder });
  const tgFiles = files.filter((f) => {
    const base = f.name.split("/").pop() ?? "";
    return base.startsWith("TG_");
  });
  console.log(
    `Found ${files.length} files under ${folder}; ${tgFiles.length} match TG_`,
  );
  for (const f of tgFiles) {
    console.log(`  deleting ${f.name.split("/").pop()}`);
    await f.delete();
  }
  console.log(`Deleted ${tgFiles.length} TG product image files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
