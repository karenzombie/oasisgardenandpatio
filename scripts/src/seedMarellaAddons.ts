// Seed the Marella Resort Cabana wall add-on subsystem (Phase 2 / Task #7).
//
// All values are loaded VERBATIM from the approved spec
// `attached_assets/frankford_marella_spec_1782437886572.md`. Idempotent: safe to
// re-run. Loads:
//   - 3 per-grade wall add-ons (MLA-FW, MLA-SW, MLA-HC) + their grade prices
//   - 1 flat replacement-stem add-on (MLA-8ST2)
//   - 3 selector images uploaded to Object Storage (routed OUT of the gallery)
//   - product_finish_options.min_order_qty (5 for every non-SR finish, null SR)
//   - products.finish_min_qty_note default text
//
// Pricing: A and A+ share one column on Marella; both grades load at the A/A+
// value (mirrors the canopy variant grade rows). Sale = ceil(MSRP * 0.90),
// already encoded verbatim from the spec tables.
import { readFile } from "node:fs/promises";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import {
  productsTable,
  productAddonOptionsTable,
  productAddonGradePricesTable,
  productFinishOptionsTable,
  finishesTable,
} from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const PRODUCT_SLUG = "marella-resort-cabana";
const IMAGE_DIR =
  "/home/runner/workspace/additional_frankford_images_6-25-26/Marella_Luxury_Cabana";
const FINISH_MIN_QTY_NOTE = "Minimum order quantity of 5 for special finishes";

// ---- Object Storage upload (same sidecar pattern as other seed scripts) ----
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

// ---- Add-on definitions (verbatim from spec) ----
type GradeRow = { grade: string; msrp: string; salePrice: string };

// Expand a single A/A+ shared value into both grade rows, then append B..F.
function gradeRows(
  shared: [string, string],
  rest: Array<[string, string, string]>,
): GradeRow[] {
  const [aMsrp, aSale] = shared;
  return [
    { grade: "A", msrp: aMsrp, salePrice: aSale },
    { grade: "A+", msrp: aMsrp, salePrice: aSale },
    ...rest.map(([grade, msrp, salePrice]) => ({ grade, msrp, salePrice })),
  ];
}

type AddonDef = {
  sku: string;
  name: string;
  description: string;
  imageFile: string | null;
  pricingMode: "per_grade" | "flat";
  flatMsrp: string | null;
  flatSalePrice: string | null;
  triggersPairing: boolean;
  isPairingTarget: boolean;
  displayOrder: number;
  gradePrices: GradeRow[];
};

const ADDONS: AddonDef[] = [
  {
    sku: "MLA-FW",
    name: "Full Privacy Tension Wall",
    description:
      "Designed to pair with a required lower tension rail, each full privacy wall includes a support rail for stability and clean lines.",
    imageFile: "MARELLA_-FULL-WALL.jpg",
    pricingMode: "per_grade",
    flatMsrp: null,
    flatSalePrice: null,
    triggersPairing: true,
    isPairingTarget: false,
    displayOrder: 0,
    gradePrices: gradeRows(
      ["496", "447"],
      [
        ["B", "693", "624"],
        ["C", "752", "677"],
        ["D", "817", "736"],
        ["E", "915", "824"],
        ["F", "1039", "936"],
      ],
    ),
  },
  {
    sku: "MLA-SW",
    name: "Full Curtain Split Wall",
    description:
      "This privacy wall allows for movement and airflow while maintaining coverage. Pair two split walls together to create a more secluded enclosure without sacrificing elegance.",
    imageFile: "MARELLA_-FULL-BACK.jpg",
    pricingMode: "per_grade",
    flatMsrp: null,
    flatSalePrice: null,
    triggersPairing: true,
    isPairingTarget: false,
    displayOrder: 1,
    gradePrices: gradeRows(
      ["346", "312"],
      [
        ["B", "543", "489"],
        ["C", "602", "542"],
        ["D", "667", "601"],
        ["E", "765", "689"],
        ["F", "889", "801"],
      ],
    ),
  },
  {
    sku: "MLA-HC",
    name: "Entrance Half Curtains",
    description:
      "Sold as a pair, these half curtains can zip into a full or split wall configuration, capping the ends and defining the entrance with tailored precision.",
    imageFile: "MARELLA_-FULL-BREEZE_1.jpg",
    pricingMode: "per_grade",
    flatMsrp: null,
    flatSalePrice: null,
    triggersPairing: false,
    isPairingTarget: true,
    displayOrder: 2,
    gradePrices: gradeRows(
      ["160", "144"],
      [
        ["B", "266", "240"],
        ["C", "296", "267"],
        ["D", "326", "294"],
        ["E", "356", "321"],
        ["F", "396", "357"],
      ],
    ),
  },
  {
    sku: "MLA-8ST2",
    name: "Replacement Stainless Steel Stem",
    description: "Replacement 8\" stainless steel stem (8\" x 2\", 6 lbs).",
    imageFile: null,
    pricingMode: "flat",
    flatMsrp: "216",
    flatSalePrice: "195",
    triggersPairing: false,
    isPairingTarget: false,
    displayOrder: 3,
    gradePrices: [],
  },
];

async function main() {
  const [product] = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.slug, PRODUCT_SLUG))
    .limit(1);
  if (!product) {
    throw new Error(`Product not found for slug "${PRODUCT_SLUG}"`);
  }
  const productId = product.id;
  console.log(`Marella product: id=${productId} (${product.name})`);

  // 1) Upload selector images (idempotent — overwrites same object path).
  const imageUrlByFile = new Map<string, string>();
  for (const a of ADDONS) {
    if (!a.imageFile) continue;
    const url = await uploadFile(
      `${IMAGE_DIR}/${a.imageFile}`,
      "addons",
      a.imageFile,
    );
    imageUrlByFile.set(a.imageFile, url);
    console.log(`Uploaded ${a.sku} selector image -> ${url}`);
  }

  // 2) Upsert add-on options + grade prices.
  for (const a of ADDONS) {
    const imageUrl = a.imageFile ? imageUrlByFile.get(a.imageFile)! : null;
    const values = {
      productId,
      sku: a.sku,
      name: a.name,
      description: a.description,
      imageUrl,
      pricingMode: a.pricingMode,
      flatMsrp: a.flatMsrp,
      flatSalePrice: a.flatSalePrice,
      triggersPairing: a.triggersPairing,
      isPairingTarget: a.isPairingTarget,
      enabled: true,
      displayOrder: a.displayOrder,
    };
    const [row] = await db
      .insert(productAddonOptionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          productAddonOptionsTable.productId,
          productAddonOptionsTable.sku,
        ],
        set: {
          name: values.name,
          description: values.description,
          imageUrl: values.imageUrl,
          pricingMode: values.pricingMode,
          flatMsrp: values.flatMsrp,
          flatSalePrice: values.flatSalePrice,
          triggersPairing: values.triggersPairing,
          isPairingTarget: values.isPairingTarget,
          enabled: values.enabled,
          displayOrder: values.displayOrder,
        },
      })
      .returning({ id: productAddonOptionsTable.id });
    const addonId = row!.id;

    for (const gp of a.gradePrices) {
      await db
        .insert(productAddonGradePricesTable)
        .values({
          addonOptionId: addonId,
          grade: gp.grade,
          msrp: gp.msrp,
          salePrice: gp.salePrice,
        })
        .onConflictDoUpdate({
          target: [
            productAddonGradePricesTable.addonOptionId,
            productAddonGradePricesTable.grade,
          ],
          set: { msrp: gp.msrp, salePrice: gp.salePrice },
        });
    }
    console.log(
      `Upserted add-on ${a.sku} (${a.pricingMode}) with ${a.gradePrices.length} grade rows`,
    );
  }

  // 3) Finish min-order-qty: 5 for every non-SR (non-Platinum) finish, null SR.
  const finishOptions = await db
    .select({
      optionId: productFinishOptionsTable.id,
      itemNumber: finishesTable.itemNumber,
      name: finishesTable.name,
    })
    .from(productFinishOptionsTable)
    .innerJoin(
      finishesTable,
      eq(finishesTable.id, productFinishOptionsTable.finishId),
    )
    .where(eq(productFinishOptionsTable.productId, productId));

  for (const f of finishOptions) {
    // SR Platinum is the only free/standard finish; every other (special)
    // finish carries a minimum order quantity of 5 per the MSRP grid.
    const minQty = f.itemNumber === "SR" ? null : 5;
    await db
      .update(productFinishOptionsTable)
      .set({ minOrderQty: minQty })
      .where(eq(productFinishOptionsTable.id, f.optionId));
    console.log(
      `Finish ${f.itemNumber ?? "(no code)"} "${f.name}": min_order_qty=${minQty ?? "null"}`,
    );
  }

  // 4) Default finish-min-qty note on the product. Only set when currently
  // null/empty so a re-run never clobbers an admin edit to a custom note.
  await db
    .update(productsTable)
    .set({ finishMinQtyNote: FINISH_MIN_QTY_NOTE })
    .where(
      and(eq(productsTable.id, productId), isNull(productsTable.finishMinQtyNote)),
    );
  console.log(`Set finish_min_qty_note default (if unset): "${FINISH_MIN_QTY_NOTE}"`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
