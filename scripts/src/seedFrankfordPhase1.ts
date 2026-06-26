import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productFinishOptionsTable,
  productFabricOptionsTable,
  productImagesTable,
  productRecommendationsTable,
  finishesTable,
  inventoryTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Frankford Phase 1: load 4 new umbrella products (Eclipse / grade-mode pattern)
//   The Nova, The Avalon, The Emerald Coast, Marella Resort Cabana (BASE).
// All values are loaded verbatim from the approved spec files. Idempotent:
// matched on exact SKU (products) / variant SKU (variants); safe to rerun.
//
// NOT in this script (Phase 2): the Marella wall add-on selector (MLA-FW/SW/HC),
// the MLA-8ST2 replacement stem, the enforced pairing, and the minimum-order-
// quantity-by-finish rule. The three add-on selector images are deliberately
// kept OUT of the product gallery.
// ---------------------------------------------------------------------------

const MANUFACTURER_ID = 28; // Frankford Umbrellas
const CATEGORY_ID = 38; // Umbrellas
const WORKSPACE_ROOT = join(import.meta.dirname, "../..");
const IMAGE_ROOT = join(WORKSPACE_ROOT, "additional_frankford_images_6-25-26");
const ECLIPSE_SLUG = "eclipse-cantilever-frankford";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford";

const GRADES = ["A", "A+", "B", "C", "D", "E", "F"] as const;
type Grade = (typeof GRADES)[number];
type GradeRow = [Grade, number, number]; // [grade, msrp, sale]

// Three Marella add-on selector images: routed OUT of the gallery (Phase 2).
const MARELLA_ADDON_IMAGES = new Set([
  "MARELLA_-FULL-WALL.jpg",
  "MARELLA_-FULL-BACK.jpg",
  "MARELLA_-FULL-BREEZE_1.jpg",
]);

// ---------------------------------------------------------------------------
// Object storage
// ---------------------------------------------------------------------------

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
  } as never,
  projectId: "",
});

function contentType(file: string): string {
  if (file.toLowerCase().endsWith(".png")) return "image/png";
  if (file.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function uploadImage(absPath: string, storageName: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const file = storage.bucket(bucketName).file(objectName);
  await file.save(await readFile(absPath), {
    contentType: contentType(absPath),
    resumable: false,
  });
  return `/objects/${STORAGE_SUBDIR}/${storageName}`;
}

// ---------------------------------------------------------------------------
// Spec data (verbatim)
// ---------------------------------------------------------------------------

interface VariantDef {
  sku: string;
  name: string; // variant_name (Configuration option label text)
  weight?: number | null; // inline per-variant weight (Nova only)
  dimensions?: string | null; // inline per-variant dimensions (Nova only)
  grades: GradeRow[];
}

interface FinishDef {
  name: string; // finishes.name (matched within manufacturer 28)
  upMsrp: number;
  upSale: number;
}

interface RecDef {
  sku: string;
  recommended: boolean;
}

interface ProductDef {
  slug: string;
  sku: string;
  name: string;
  description: string;
  shortDescription: string;
  umbrellaType: string | null;
  umbrellaShape: string | null;
  liftMechanism: string | null;
  tiltMechanism: string | null;
  poleMaterial: string | null;
  subCategory: string | null;
  weight: string; // numeric as string
  dimensions: string;
  variants: VariantDef[]; // variants[0] = lead (display_order 0)
  finishes: FinishDef[]; // [] = no finish picker (Avalon/Emerald)
  recommendations: RecDef[];
  imageFolder: string;
}

const NOVA_GRADES: GradeRow[] = [
  ["A", 7310, 6579],
  ["A+", 8070, 7263],
  ["B", 8756, 7881],
  ["C", 9023, 8121],
  ["D", 9289, 8361],
  ["E", 9555, 8600],
  ["F", 9954, 8959],
];

const PRODUCTS: ProductDef[] = [
  {
    slug: "the-nova",
    sku: "896NGU",
    name: "The Nova",
    description:
      "The Nova offers maximum shade and weather protection for commercial and residential environments. Its 9 oz. marine-grade acrylic canopy is supported by reinforced extruded aluminum ribs that connect to a 4-inch mast. The commercial-grade telescoping mechanism allows for effortless opening and closing of the umbrellas without having to move any furniture underneath. The Nova is one of the only large shade structures in the industry with semi-permanent and non-permanent mounts available. This umbrella not only looks spectacular, but is a practical shade solution in a number of applications.",
    shortDescription: "Giant telescoping umbrella",
    umbrellaType: "Market",
    umbrellaShape: "Octagon",
    liftMechanism: "Crank",
    tiltMechanism: null,
    poleMaterial: "Aluminum",
    subCategory: null,
    weight: "205",
    dimensions:
      'Open Clearance: 90.8"/230cm | Closed Clearance: 52"/132cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 205 lbs./93 kg.',
    variants: [
      {
        sku: "896NGU",
        name: "16' Octagon / 5M",
        weight: 205,
        dimensions:
          'Open Clearance: 90.8"/230cm | Closed Clearance: 52"/132cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 205 lbs./93 kg.',
        grades: NOVA_GRADES,
      },
      {
        sku: "8110NGU-SQ",
        name: "13' x 13' Square / 4M x 4M",
        weight: 195,
        dimensions:
          'Open Clearance: 92"/233cm | Closed Clearance: 66"/167cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 195 lbs./88 kg.',
        grades: NOVA_GRADES,
      },
    ],
    finishes: [
      { name: "Brushed Silver", upMsrp: 0, upSale: 0 },
      { name: "Golden Oak", upMsrp: 1400, upSale: 1260 },
      { name: "Heather Willow", upMsrp: 1400, upSale: 1260 },
      { name: "Onyx", upMsrp: 940, upSale: 846 },
      { name: "Desert Bronze", upMsrp: 940, upSale: 846 },
      { name: "Alpine White", upMsrp: 940, upSale: 846 },
      { name: "Carbon", upMsrp: 940, upSale: 846 },
    ],
    recommendations: [
      { sku: "NGU550", recommended: true },
      { sku: "NGU-DP", recommended: false },
      { sku: "IG-GIANT", recommended: false },
    ],
    imageFolder: "Nova",
  },
  {
    slug: "the-avalon",
    sku: "844FWB-01",
    name: "The Avalon",
    description:
      'Modern fiberglass beach umbrella. Manual lift. 8mm flexible fiberglass ribs and struts. 1.375" diameter solid ash wood center pole (pointed bottom for sand) with stainless steel hardware throughout. 4-layer fabric protection and closed-stitching pocket. Note: overall height is the full length of the umbrella and varies depending on how far the pole is placed in the sand.',
    shortDescription: "Fiberglass Beach Umbrella",
    umbrellaType: "Beach",
    umbrellaShape: null, // varies by variant (Hexagonal / Octagon)
    liftMechanism: "Manual",
    tiltMechanism: null,
    poleMaterial: "Ash Wood",
    subCategory: null,
    weight: "14",
    dimensions:
      'Overall Height: 94" | Upper Pole: 55"/139cm | Lower Pole: 38"/96.5cm | Weight: 14 lbs./6.4 kg.',
    variants: [
      {
        sku: "844FWB-01",
        name: "7.5' Octagon / 2.3M — Valance, No Vent",
        grades: [
          ["A", 445, 401],
          ["A+", 542, 488],
          ["B", 599, 540],
          ["C", 671, 604],
          ["D", 745, 671],
          ["E", 819, 738],
          ["F", 918, 827],
        ],
      },
      {
        sku: "639FWB-01",
        name: "6.5' Hex / 2M — Valance, No Vent",
        grades: [
          ["A", 383, 345],
          ["A+", 478, 431],
          ["B", 530, 477],
          ["C", 603, 543],
          ["D", 676, 609],
          ["E", 750, 675],
          ["F", 848, 764],
        ],
      },
      {
        sku: "844FWB-02",
        name: "7.5' Octagon / 2.3M — Valance / Vent",
        grades: [
          ["A", 488, 440],
          ["A+", 584, 526],
          ["B", 646, 582],
          ["C", 719, 648],
          ["D", 793, 714],
          ["E", 865, 779],
          ["F", 964, 868],
        ],
      },
      {
        sku: "844FWB-03",
        name: "7.5' Octagon / 2.3M — No Valance / Vent",
        grades: [
          ["A", 488, 440],
          ["A+", 584, 526],
          ["B", 646, 582],
          ["C", 719, 648],
          ["D", 793, 714],
          ["E", 865, 779],
          ["F", 964, 868],
        ],
      },
    ],
    finishes: [],
    recommendations: [
      { sku: "30-SA", recommended: true },
      { sku: "CB01", recommended: false },
      { sku: "Sand Anchor", recommended: false },
    ],
    imageFolder: "Avalon_Fiberglass_Beach",
  },
  {
    slug: "the-emerald-coast",
    sku: "845W",
    name: "The Emerald Coast",
    description:
      'Classic steel-frame beach umbrella. Manual lift. 5mm steel ribs. 1.375" diameter solid ash wood center pole (pointed bottom for sand) with stainless steel hardware throughout. Non-twisting end tips. Marine-grade acrylic canopy. Steel bell cap.',
    shortDescription: "Steel frame beach umbrella",
    umbrellaType: "Beach",
    umbrellaShape: null, // varies by variant (Hexagonal / Octagon)
    liftMechanism: "Manual",
    tiltMechanism: null,
    poleMaterial: "Ash Wood",
    subCategory: null,
    weight: "15",
    dimensions:
      'Overall Height: 94" | Upper Pole: 55"/139cm | Lower Pole: 38"/96.5cm | Weight: 15 lbs./6.8 kg.',
    variants: [
      {
        sku: "845W",
        name: "7.5' Octagon / 2.3M — Valance, No Vent",
        grades: [
          ["A", 381, 343],
          ["A+", 476, 429],
          ["B", 527, 475],
          ["C", 601, 541],
          ["D", 672, 605],
          ["E", 747, 673],
          ["F", 846, 762],
        ],
      },
      {
        sku: "639W",
        name: "6.5' Hex / 2M — Valance, No Vent",
        grades: [
          ["A", 355, 320],
          ["A+", 450, 405],
          ["B", 497, 448],
          ["C", 571, 514],
          ["D", 644, 580],
          ["E", 718, 647],
          ["F", 817, 736],
        ],
      },
    ],
    finishes: [],
    recommendations: [
      { sku: "30-SA", recommended: true },
      { sku: "CB01", recommended: false },
      { sku: "Sand Anchor", recommended: false },
    ],
    imageFolder: "Emerald_Coast_Classic_Steel_Beach",
  },
  {
    slug: "marella-resort-cabana",
    sku: "883MLA-SQ",
    name: "Marella Resort Cabana",
    description:
      'The Marella is a 10ft x 10ft square luxury pool, beach, and resort cabana. Complete marine-grade extruded aluminum frame with Type II, Class I performance marine anodizing and 316L stainless steel hardware and couplings throughout. 2" diameter (.125" thick) corner mounting posts, 1.5" diameter (.125" thick) 45-degree corner structure supports, and 2mm thick canopy ribs for added strength against the wind. Easy drop-in canopy attachment with barrel bolt connections, engineered for simplified assembly.\nIncluded: four (4) MLA-8ST2 8" stainless steel stems, four (4) full-corner accent curtains, and the VF-SS stainless steel vertex finial.\nWind rating: engineered to withstand sustained 35 mph winds. The wind rating is null and void when full or split walls are in use.',
    shortDescription: "Custom Lead Times, Call for Details",
    umbrellaType: "Cabana",
    umbrellaShape: "Square",
    liftMechanism: null,
    tiltMechanism: null,
    poleMaterial: "Aluminum",
    subCategory: "Cabana",
    weight: "285",
    dimensions:
      'Footprint: 120"x120"/3m x 3m | Height: 127.8"/323.1cm | Clearance: 91.9" | Leg Pole Diameter: 2"/5cm | Weight: 285 lbs./129.27 kg.',
    variants: [
      {
        sku: "883MLA-SQ",
        name: "10' x 10' Square / 3M",
        grades: [
          ["A", 8650, 7785],
          ["A+", 8650, 7785],
          ["B", 9372, 8435],
          ["C", 9645, 8681],
          ["D", 9910, 8919],
          ["E", 10180, 9162],
          ["F", 10460, 9414],
        ],
      },
    ],
    finishes: [
      { name: "Platinum", upMsrp: 0, upSale: 0 },
      { name: "Golden Oak", upMsrp: 980, upSale: 882 },
      { name: "Heather Willow", upMsrp: 980, upSale: 882 },
      { name: "Onyx", upMsrp: 550, upSale: 495 },
      { name: "Desert Bronze", upMsrp: 550, upSale: 495 },
      { name: "Alpine White", upMsrp: 550, upSale: 495 },
      { name: "Carbon", upMsrp: 550, upSale: 495 },
    ],
    recommendations: [
      { sku: "30G-MLA", recommended: true },
      { sku: "36G-MLA", recommended: false },
      { sku: "36G-SQ-MLA", recommended: false },
      { sku: "30Gx2-MLA", recommended: false },
      { sku: "30G+24G-MLA", recommended: false },
      { sku: "DP-ST-MLA", recommended: false },
      { sku: "IG-ST-MLA", recommended: false },
      { sku: "SS-DB-4-Marella", recommended: false },
    ],
    imageFolder: "Marella_Luxury_Cabana",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureInventory(productId: number, variantId: number | null) {
  const existing = await db
    .select({ id: inventoryTable.id })
    .from(inventoryTable)
    .where(
      and(
        eq(inventoryTable.productId, productId),
        variantId === null
          ? eq(inventoryTable.variantId, 0) // placeholder, replaced below
          : eq(inventoryTable.variantId, variantId),
      ),
    )
    .limit(1);
  // The composite above can't express "variantId IS NULL" cleanly via eq, so
  // re-query explicitly for the null case.
  if (variantId === null) {
    const rows = await db
      .select({ id: inventoryTable.id, variantId: inventoryTable.variantId })
      .from(inventoryTable)
      .where(eq(inventoryTable.productId, productId));
    if (rows.some((r) => r.variantId === null)) return;
  } else if (existing.length) {
    return;
  }
  await db.insert(inventoryTable).values({
    productId,
    variantId,
    onHand: 0,
    reorderThreshold: 0,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Finish name -> id (manufacturer 28)
  const finishRows = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, MANUFACTURER_ID));
  const finishByName = new Map(finishRows.map((f) => [f.name, f.id]));

  // Eclipse fabric pool to copy onto every new product.
  const [eclipse] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.slug, ECLIPSE_SLUG))
    .limit(1);
  if (!eclipse) throw new Error(`Eclipse product (${ECLIPSE_SLUG}) not found`);
  const eclipseFabrics = await db
    .select({ fabricId: productFabricOptionsTable.fabricId })
    .from(productFabricOptionsTable)
    .where(eq(productFabricOptionsTable.productId, eclipse.id));
  const fabricIds = eclipseFabrics.map((f) => f.fabricId);
  console.log(`Eclipse fabric pool to copy: ${fabricIds.length} fabrics\n`);

  for (const p of PRODUCTS) {
    console.log(`=== ${p.name} (${p.sku}) ===`);
    const leadGradeA = p.variants[0].grades.find((g) => g[0] === "A");
    if (!leadGradeA) throw new Error(`${p.sku}: lead variant missing Grade A`);
    const price = String(leadGradeA[1]);
    const sale = String(leadGradeA[2]);

    const productValues = {
      name: p.name,
      description: p.description,
      shortDescription: p.shortDescription,
      manufacturerId: MANUFACTURER_ID,
      categoryId: CATEGORY_ID,
      umbrellaType: p.umbrellaType,
      umbrellaShape: p.umbrellaShape,
      liftMechanism: p.liftMechanism,
      tiltMechanism: p.tiltMechanism,
      poleMaterial: p.poleMaterial,
      subCategory: p.subCategory,
      collection: null,
      dimensions: p.dimensions,
      weight: p.weight,
      msrp: price,
      price,
      salePrice: sale,
      availableOnline: true,
      showPriceOnline: true,
      quoteOnly: false,
      inStoreOnly: false,
      isActive: true,
      pricingMode: "fixed" as const,
    };

    // --- Product (match on SKU) ---
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, p.sku))
      .limit(1);

    let productId: number;
    if (existing) {
      await db
        .update(productsTable)
        .set({ ...productValues, updatedAt: new Date() })
        .where(eq(productsTable.id, existing.id));
      productId = existing.id;
      console.log(`  product updated (id=${productId})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          ...productValues,
          slug: p.slug,
          sku: p.sku,
          featured: false,
          displayOrder: 0,
          lowStockThreshold: 0,
        })
        .returning({ id: productsTable.id });
      productId = ins.id;
      console.log(`  product inserted (id=${productId})`);
    }
    await ensureInventory(productId, null);

    // --- Variants + grade prices ---
    for (let vi = 0; vi < p.variants.length; vi++) {
      const v = p.variants[vi];
      const variantValues = {
        variantName: v.name,
        optionLabel: "Configuration",
        priceAdjustment: "0",
        displayOrder: vi,
        isActive: true,
        weight: v.weight != null ? String(v.weight) : null,
        dimensions: v.dimensions ?? null,
      };
      const [exV] = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.variantSku, v.sku))
        .limit(1);

      let variantId: number;
      if (exV) {
        await db
          .update(productVariantsTable)
          .set({ ...variantValues, updatedAt: new Date() })
          .where(eq(productVariantsTable.id, exV.id));
        variantId = exV.id;
      } else {
        const [insV] = await db
          .insert(productVariantsTable)
          .values({ ...variantValues, productId, variantSku: v.sku })
          .returning({ id: productVariantsTable.id });
        variantId = insV.id;
      }
      await ensureInventory(productId, variantId);

      for (const [grade, msrp, salePrice] of v.grades) {
        await db
          .insert(variantGradePricesTable)
          .values({
            variantId,
            grade,
            msrp: String(msrp),
            salePrice: String(salePrice),
          })
          .onConflictDoUpdate({
            target: [
              variantGradePricesTable.variantId,
              variantGradePricesTable.grade,
            ],
            set: {
              msrp: String(msrp),
              salePrice: String(salePrice),
              updatedAt: new Date(),
            },
          });
      }
      console.log(`  variant ${v.sku}: ${v.grades.length} grade prices`);
    }

    // --- Finishes (with flat upcharges; first = standard at 0) ---
    for (let fi = 0; fi < p.finishes.length; fi++) {
      const f = p.finishes[fi];
      const finishId = finishByName.get(f.name);
      if (!finishId) throw new Error(`${p.sku}: finish "${f.name}" not found for mfr ${MANUFACTURER_ID}`);
      await db
        .insert(productFinishOptionsTable)
        .values({
          productId,
          finishId,
          displayOrder: fi,
          upchargeMsrp: String(f.upMsrp),
          upchargeSale: String(f.upSale),
        })
        .onConflictDoUpdate({
          target: [
            productFinishOptionsTable.productId,
            productFinishOptionsTable.finishId,
          ],
          set: {
            displayOrder: fi,
            upchargeMsrp: String(f.upMsrp),
            upchargeSale: String(f.upSale),
          },
        });
    }
    if (p.finishes.length) console.log(`  finishes: ${p.finishes.length}`);

    // --- Fabric pool (copy Eclipse) ---
    for (let i = 0; i < fabricIds.length; i += 500) {
      const chunk = fabricIds.slice(i, i + 500);
      await db
        .insert(productFabricOptionsTable)
        .values(chunk.map((fabricId) => ({ productId, fabricId })))
        .onConflictDoNothing();
    }
    console.log(`  fabric options: ${fabricIds.length}`);

    // --- Recommendations (source = product SKU) ---
    for (let ri = 0; ri < p.recommendations.length; ri++) {
      const r = p.recommendations[ri];
      await db
        .insert(productRecommendationsTable)
        .values({
          sourceSku: p.sku,
          compatibleSku: r.sku,
          isRecommended: r.recommended,
          displayOrder: ri,
        })
        .onConflictDoUpdate({
          target: [
            productRecommendationsTable.sourceSku,
            productRecommendationsTable.compatibleSku,
          ],
          set: { isRecommended: r.recommended, displayOrder: ri },
        });
    }
    console.log(`  recommendations: ${p.recommendations.length}`);

    // --- Images: upload + register (idempotent: delete + reinsert) ---
    const folder = join(IMAGE_ROOT, p.imageFolder);
    if (!existsSync(folder)) throw new Error(`image folder not found: ${folder}`);
    const { readdir } = await import("node:fs/promises");
    let files = (await readdir(folder)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    if (p.slug === "marella-resort-cabana") {
      files = files.filter((f) => !MARELLA_ADDON_IMAGES.has(f));
    }
    const primaryFile = files.find((f) => /primary\.(png|jpe?g|webp)$/i.test(f));
    if (!primaryFile) throw new Error(`${p.slug}: no *primary image in ${folder}`);
    const secondary = files
      .filter((f) => f !== primaryFile)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const ordered = [primaryFile, ...secondary];

    await db
      .delete(productImagesTable)
      .where(eq(productImagesTable.productId, productId));

    let order = 0;
    for (const file of ordered) {
      const url = await uploadImage(
        join(folder, file),
        `additional-6-25-26/${p.slug}/${file}`,
      );
      await db.insert(productImagesTable).values({
        productId,
        variantId: null,
        url,
        altText: p.name,
        displayOrder: order,
        isPrimary: order === 0,
        imageKind: "gallery",
      });
      order += 1;
    }
    console.log(`  images: ${ordered.length} (primary=${primaryFile})\n`);
  }

  console.log("Frankford Phase 1 load complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
