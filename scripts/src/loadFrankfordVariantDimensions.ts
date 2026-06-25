import { db, productVariantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Per-variant dimensions + weight for Frankford umbrella size variants.
// Source: 2026 Frankford product catalog spec pages (reviewed dataset supplied
// with the implementation brief). Matched on product_variants.variant_sku
// EXACTLY. Values are loaded verbatim — never inferred or generated.
//
// Catalina (844FA01) and Laurel (845A) are intentionally omitted: all of their
// variants are the same physical size (7.5' Octagon) and differ only by
// lift/valance/vent, so the product-level dimensions string already covers
// every variant via the null fallback.
type VariantSpec = { sku: string; weight: string; dimensions: string };

const SPECS: VariantSpec[] = [
  // Eclipse (868ECU)
  {
    sku: "868ECU",
    weight: "116",
    dimensions:
      'Closed Clearance: 41.7"/106cm | Mast Diameter: 3.3"x5"/8x12.7cm | Mast Height: 111.4"/283cm | Weight: 116 lbs./53 kg.',
  },
  {
    sku: "880ECU",
    weight: "123",
    dimensions:
      'Closed Clearance: 32"/82cm | Mast Diameter: 3.3"x5"/8x12.7cm | Mast Height: 111.4"/283cm | Weight: 123 lbs./55 kg.',
  },
  {
    sku: "883ECU-SQ",
    weight: "117",
    dimensions:
      'Closed Clearance: 27"/69cm | Mast Diameter: 3.3"x5"/8x12.7cm | Mast Height: 111.4"/283cm | Weight: 117 lbs./53.5 kg.',
  },
  {
    sku: "898ECU-R",
    weight: "128",
    dimensions:
      'Closed Clearance: 13.4"/34cm | Mast Diameter: 3.3"x5"/8x12.7cm | Mast Height: 111.4"/283cm | Weight: 128 lbs./58 kg.',
  },
  // Aurora (868ARU)
  {
    sku: "868ARU",
    weight: "95",
    dimensions:
      'Closed Clearance: 39"/100cm | Mast Diameter: 2.75"x4"/7x10cm | Mast Height: 110.6"/281cm | Weight: 95 lbs./43 kg.',
  },
  {
    sku: "880ARU",
    weight: "97",
    dimensions:
      'Closed Clearance: 32"/81cm | Mast Diameter: 2.75"x4"/7x10cm | Mast Height: 110.6"/281cm | Weight: 97 lbs./44 kg.',
  },
  {
    sku: "883ARU-SQ",
    weight: "94",
    dimensions:
      'Closed Clearance: 27"/68cm | Mast Diameter: 2.75"x4"/7x10cm | Mast Height: 110.6"/281cm | Weight: 94 lbs./43 kg.',
  },
  {
    sku: "882ARU-R",
    weight: "93.5",
    dimensions:
      'Closed Clearance: 27.4"/70cm | Mast Diameter: 2.75"x4"/7x10cm | Mast Height: 110.6"/281cm | Weight: 93.5 lbs./42.5 kg.',
  },
  // Greenwich Market (845CAM)
  {
    sku: "845CAM",
    weight: "20",
    dimensions:
      'Open Clearance: 70"/177cm | Closed Clearance: 44"/111cm | Overall Height: 94"/238cm | Mast Diameter: 1.5"/3.8cm | Weight: 20 lbs./9 kg.',
  },
  {
    sku: "854CAM",
    weight: "22",
    dimensions:
      'Open Clearance: 76"/193cm | Closed Clearance: 42"/106cm | Overall Height: 102"/259cm | Mast Diameter: 1.5"/3.8cm | Weight: 22 lbs./10 kg.',
  },
  {
    sku: "864CAM",
    weight: "26",
    dimensions:
      'Open Clearance: 82"/208cm | Closed Clearance: 40"/101cm | Overall Height: 108"/274cm | Mast Diameter: 1.5"/3.8cm | Weight: 26 lbs./12 kg.',
  },
  {
    sku: "454CAM-SQ",
    weight: "18",
    dimensions:
      'Open Clearance: 76"/193cm | Closed Clearance: 42"/106cm | Overall Height: 102"/259cm | Mast Diameter: 1.5"/3.8cm | Weight: 18 lbs./8.5 kg.',
  },
  {
    sku: "864CAM-SQ",
    weight: "24",
    dimensions:
      'Open Clearance: 82"/208cm | Closed Clearance: 40"/101cm | Overall Height: 108"/274cm | Mast Diameter: 1.5"/3.8cm | Weight: 24 lbs./11 kg.',
  },
  // Monterey Market - Pulley (845FM)
  {
    sku: "845FM",
    weight: "20",
    dimensions:
      'Open Clearance: 70"/177cm | Closed Clearance: 44"/111cm | Overall Height: 94"/238cm | Mast Diameter: 1.5"/3.8cm | Weight: 20 lbs./9 kg.',
  },
  {
    sku: "854FM",
    weight: "22",
    dimensions:
      'Open Clearance: 76"/193cm | Closed Clearance: 42"/106cm | Overall Height: 102"/259cm | Mast Diameter: 1.5"/3.8cm | Weight: 22 lbs./10 kg.',
  },
  {
    sku: "864FM",
    weight: "26",
    dimensions:
      'Open Clearance: 82"/208cm | Closed Clearance: 40"/101cm | Overall Height: 108"/274cm | Mast Diameter: 1.5"/3.8cm | Weight: 26 lbs./12 kg.',
  },
  {
    sku: "454FM-SQ",
    weight: "18",
    dimensions:
      'Open Clearance: 76"/193cm | Closed Clearance: 42"/106cm | Overall Height: 102"/259cm | Mast Diameter: 1.5"/3.8cm | Weight: 18 lbs./8.5 kg.',
  },
  {
    sku: "864FM-SQ",
    weight: "24",
    dimensions:
      'Open Clearance: 82"/208cm | Closed Clearance: 40"/101cm | Overall Height: 108"/274cm | Mast Diameter: 1.5"/3.8cm | Weight: 24 lbs./11 kg.',
  },
  // Monterey Market - Auto Tilt (845FMA)
  {
    sku: "845FMA",
    weight: "20",
    dimensions:
      'Open Clearance: 72"/182cm | Closed Clearance: 49"/124cm | Overall Height: 98"/248cm | Mast Diameter: 1.5"/3.8cm | Weight: 20 lbs./9 kg.',
  },
  {
    sku: "854FMA",
    weight: "22",
    dimensions:
      'Open Clearance: 79"/200cm | Closed Clearance: 48"/121cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 22 lbs./10 kg.',
  },
  {
    sku: "864FMA",
    weight: "26",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 41"/104cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 26 lbs./12 kg.',
  },
  {
    sku: "454FMA-SQ",
    weight: "18",
    dimensions:
      'Open Clearance: 79"/200cm | Closed Clearance: 48"/121cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 18 lbs./8.5 kg.',
  },
  {
    sku: "864FMA-SQ",
    weight: "24",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 41"/104cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 24 lbs./11 kg.',
  },
  {
    sku: "876FMA-R",
    weight: "28",
    dimensions:
      'Open Clearance: 88"/223cm | Closed Clearance: 39"/99cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 28 lbs./12.7 kg.',
  },
  // Monterey Market - No Tilt (845FMC)
  {
    sku: "845FMC",
    weight: "18",
    dimensions:
      'Open Clearance: 72"/182cm | Closed Clearance: 49"/124cm | Overall Height: 98"/248cm | Mast Diameter: 1.5"/3.8cm | Weight: 18 lbs./8.5 kg.',
  },
  {
    sku: "854FMC",
    weight: "20",
    dimensions:
      'Open Clearance: 79"/200cm | Closed Clearance: 48"/121cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 20 lbs./9 kg.',
  },
  {
    sku: "864FMC",
    weight: "24",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 41"/104cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 24 lbs./11 kg.',
  },
  {
    sku: "454FMC-SQ",
    weight: "16",
    dimensions:
      'Open Clearance: 79"/200cm | Closed Clearance: 48"/121cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 16 lbs./7 kg.',
  },
  {
    sku: "864FMC-SQ",
    weight: "21",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 41"/104cm | Overall Height: 107"/271cm | Mast Diameter: 1.5"/3.8cm | Weight: 21 lbs./9.5 kg.',
  },
  {
    sku: "882FMC-R",
    weight: "24",
    dimensions:
      'Open Clearance: 94"/238cm | Closed Clearance: 31.25"/79.4cm | Overall Height: 120"/304cm | Mast Diameter: 1.5"/3.8cm | Weight: 24 lbs./11 kg.',
  },
  // Greenwich Giant (880CAM)
  {
    sku: "880CAM",
    weight: "47",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 30.5"/77cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 47 lbs./21 kg.',
  },
  {
    sku: "883CAM-SQ",
    weight: "43",
    dimensions:
      'Open Clearance: 85.5"/217cm | Closed Clearance: 28"/71cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 43 lbs./19.5 kg.',
  },
  {
    sku: "882CAM-R",
    weight: "42",
    dimensions:
      'Open Clearance: 88"/223cm | Closed Clearance: 27"/68cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 42 lbs./19 kg.',
  },
  // Monterey Giant (880FM)
  {
    sku: "880FM",
    weight: "47",
    dimensions:
      'Open Clearance: 87"/221cm | Closed Clearance: 30.5"/77cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 47 lbs./21 kg.',
  },
  {
    sku: "883FM-SQ",
    weight: "43",
    dimensions:
      'Open Clearance: 85.5"/217cm | Closed Clearance: 28"/71cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 43 lbs./19.5 kg.',
  },
  {
    sku: "882FM-R",
    weight: "42",
    dimensions:
      'Open Clearance: 88"/223cm | Closed Clearance: 27"/68cm | Overall Height: 112.5"/285cm | Mast Diameter: 2"/5cm | Weight: 42 lbs./19 kg.',
  },
  // Nova (896NGU) - NEW. 883NGU-SQ (10' square) is a min-order special-order
  // item, omitted from the site per the dataset.
  {
    sku: "896NGU",
    weight: "205",
    dimensions:
      'Open Clearance: 90.8"/230cm | Closed Clearance: 52"/132cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 205 lbs./93 kg.',
  },
  {
    sku: "8110NGU-SQ",
    weight: "195",
    dimensions:
      'Open Clearance: 92"/233cm | Closed Clearance: 66"/167cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 195 lbs./88 kg.',
  },
];

async function main() {
  let updated = 0;
  const missing: string[] = [];

  for (const spec of SPECS) {
    const result = await db
      .update(productVariantsTable)
      .set({ dimensions: spec.dimensions, weight: spec.weight })
      .where(eq(productVariantsTable.variantSku, spec.sku))
      .returning({ id: productVariantsTable.id });

    if (result.length === 0) {
      missing.push(spec.sku);
    } else {
      updated += result.length;
      if (result.length > 1) {
        console.warn(
          `  ! ${spec.sku} matched ${result.length} variant rows (expected 1)`,
        );
      }
    }
  }

  console.log(`Updated ${updated} variant rows from ${SPECS.length} specs.`);
  if (missing.length > 0) {
    console.warn(`No variant matched these SKUs: ${missing.join(", ")}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
