import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { finishesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "finishes/frankford";
const IMG_DIR = join(import.meta.dirname, "../../Frankford_Valance_Images");
const MANUFACTURER_ID = 28;

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

async function uploadImage(filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = await readFile(join(IMG_DIR, filename));
  await file.save(buffer, { contentType: "image/png", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

const VALANCES = [
  {
    code: "V1",
    filename: "Valance_Standard_V1.png",
    name: "Standard Valance",
    description: `Length: 6" - The flap style valance offers a clean, structured look rooted in early American and colonial design. Characterized by its flat, symmetrical panel-like sections that hang down in even intervals.`,
  },
  {
    code: "V2",
    filename: "Valance_Whale_Tail_V2.png",
    name: "Whale Tail Valance",
    description: `Length: 6" - A distinctive valance named for its dramatic center swoop that resembles the fluke of a whale's tail. The whale tail valance adds a sense of movement and elegance to any outdoor space.`,
  },
  {
    code: "V3",
    filename: "Valance_Classic_Scallop_5inch_V3.png",
    name: "Classic Scallop Valance",
    description: `Length: 5" - The scallop valance is a timeless style that adds elegance and softness. With its gently rounded, wave-like curves, this style traces its origins to classic European decor that adds charm and dimension.`,
  },
  {
    code: "V4",
    filename: "Valance_Classic_Scallop_3inch_V4.png",
    name: "Classic Scallop Valance",
    description: `Length: 3" - The scallop valance is a timeless style that adds elegance and softness. With its gently rounded, wave-like curves, this style traces its origins to classic European decor that adds charm and dimension.`,
  },
  {
    code: "V5",
    filename: "Valance_French_Scallop_V5.png",
    name: "French Scallop Valance",
    description: `Length: 6" | Width: 6" - Characterized by its soft, curved scallops and flowing lines, this valance style evokes classic European charm and timeless sophistication.`,
  },
  {
    code: "V6",
    filename: "Valance_Roman_Scallop_V6.png",
    name: "Roman Scallop Valance",
    description: `Length: 6" | Width: 6" - Originally inspired by the practical drapery used in Roman villas, its clean, horizontal folds create a tailored look that complements both traditional and contemporary spaces.`,
  },
  {
    code: "V7",
    filename: "Valance_Wave_Scallop_5inch_V7.png",
    name: "Wave Scallop Valance",
    description: `Length: 5" - A more modern take on the classic scallop. Softer curves with a more fluid contemporary look.`,
  },
  {
    code: "V8",
    filename: "Valance_Wave_Scallop_3inch_V8.png",
    name: "Wave Scallop Valance",
    description: `Length: 3" - A more modern take on the classic scallop. Softer curves with a more fluid contemporary look.`,
  },
];

async function main() {
  for (let i = 0; i < VALANCES.length; i++) {
    const v = VALANCES[i];
    console.log(`[${i + 1}/${VALANCES.length}] Uploading ${v.filename}...`);
    const imageUrl = await uploadImage(v.filename);
    console.log(`  → stored at ${imageUrl}`);

    const existing = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, MANUFACTURER_ID),
          eq(finishesTable.name, v.name),
          eq(finishesTable.description, v.description),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(finishesTable)
        .set({ itemNumber: v.code, imageUrl, collection: "Valances", displayOrder: i })
        .where(eq(finishesTable.id, existing[0].id));
      console.log(`  → updated existing finish id=${existing[0].id}`);
    } else {
      const [inserted] = await db
        .insert(finishesTable)
        .values({
          manufacturerId: MANUFACTURER_ID,
          itemNumber: v.code,
          name: v.name,
          description: v.description,
          imageUrl,
          collection: "Valances",
          displayOrder: i,
          isActive: true,
        })
        .returning({ id: finishesTable.id });
      console.log(`  → inserted finish id=${inserted.id}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
