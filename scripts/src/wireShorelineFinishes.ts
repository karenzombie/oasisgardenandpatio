/**
 * wireShorelineFinishes.ts
 *
 * 1. Inserts product_finish_options rows linking each Shoreline product to its
 *    available finish colors (as listed in the CSV).
 * 2. Tags each existing product_images row with the finish_id that corresponds
 *    to its color, matched by the image filename embedded in the storage URL.
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING for option inserts, and only
 * updates rows whose finish_id is currently NULL.
 */

import { db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  productImagesTable,
  productsTable,
  finishesTable,
  productFinishOptionsTable,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const SHORELINE_MFR_ID = 19;

// ── CSV data (parsed inline) ──────────────────────────────────────────────────
// Format: [productSku, colorName, imageFilenames[]]
// Spa-table uses original (non-colour-suffixed) filenames per the CSV notes.
const PRODUCT_COLOR_IMAGES: Array<{
  sku: string;
  colorName: string;
  filenames: string[];
}> = [
  // SL-calirondack
  { sku: "SL-calirondack", colorName: "Black", filenames: ["SL-calirondack_black.png"] },
  { sku: "SL-calirondack", colorName: "White", filenames: ["SL-calirondack_white.png"] },
  { sku: "SL-calirondack", colorName: "Charcoal", filenames: ["SL-calirondack_charcoal.png"] },
  { sku: "SL-calirondack", colorName: "Dove Grey", filenames: ["SL-calirondack_dove-grey.png"] },
  { sku: "SL-calirondack", colorName: "Sea Glass", filenames: ["SL-calirondack_sea-glass.png"] },
  { sku: "SL-calirondack", colorName: "Weatherwood", filenames: ["SL-calirondack_weatherwood.png"] },
  // SL-classic-adirondack
  { sku: "SL-classic-adirondack", colorName: "Black", filenames: ["SL-classic-adirondack_black.png"] },
  { sku: "SL-classic-adirondack", colorName: "White", filenames: ["SL-classic-adirondack_white.png"] },
  { sku: "SL-classic-adirondack", colorName: "Charcoal", filenames: ["SL-classic-adirondack_charcoal.png"] },
  { sku: "SL-classic-adirondack", colorName: "Dove Grey", filenames: ["SL-classic-adirondack_dove-grey.png"] },
  { sku: "SL-classic-adirondack", colorName: "Sea Glass", filenames: ["SL-classic-adirondack_sea-glass.png"] },
  // SL-rocking-adirondack-chair
  { sku: "SL-rocking-adirondack-chair", colorName: "Black", filenames: ["SL-rocking-adirondack-chair_black.png"] },
  { sku: "SL-rocking-adirondack-chair", colorName: "Charcoal", filenames: ["SL-rocking-adirondack-chair_charcoal.png"] },
  { sku: "SL-rocking-adirondack-chair", colorName: "Dove Grey", filenames: ["SL-rocking-adirondack-chair_dove-grey.png"] },
  { sku: "SL-rocking-adirondack-chair", colorName: "Sea Glass", filenames: ["SL-rocking-adirondack-chair_sea-glass.png"] },
  { sku: "SL-rocking-adirondack-chair", colorName: "Weatherwood", filenames: ["SL-rocking-adirondack-chair_weatherwood.png"] },
  // SL-classic-adirondack-ottoman
  { sku: "SL-classic-adirondack-ottoman", colorName: "White", filenames: ["SL-classic-adirondack-ottoman_white.png"] },
  { sku: "SL-classic-adirondack-ottoman", colorName: "Charcoal", filenames: ["SL-classic-adirondack-ottoman_charcoal-grey.png"] },
  { sku: "SL-classic-adirondack-ottoman", colorName: "Dove Grey", filenames: ["SL-classic-adirondack-ottoman_dove-grey.png"] },
  { sku: "SL-classic-adirondack-ottoman", colorName: "Weatherwood", filenames: ["SL-classic-adirondack-ottoman_weatherwood.png"] },
  // SL-rocker-adirondack
  { sku: "SL-rocker-adirondack", colorName: "Black", filenames: ["SL-rocker-adirondack_black.png"] },
  { sku: "SL-rocker-adirondack", colorName: "Charcoal", filenames: ["SL-rocker-adirondack_charcoal.png"] },
  { sku: "SL-rocker-adirondack", colorName: "Dove Grey", filenames: ["SL-rocker-adirondack_dove-grey.png"] },
  { sku: "SL-rocker-adirondack", colorName: "Sea Glass", filenames: ["SL-rocker-adirondack_sea-glass.png"] },
  { sku: "SL-rocker-adirondack", colorName: "Weatherwood", filenames: ["SL-rocker-adirondack_weatherwood.png"] },
  { sku: "SL-rocker-adirondack", colorName: "Two Tone", filenames: ["SL-rocker-adirondack_two-tone.png"] },
  // SL-modern-adirondack
  { sku: "SL-modern-adirondack", colorName: "Black", filenames: ["SL-modern-adirondack_black.png"] },
  { sku: "SL-modern-adirondack", colorName: "White", filenames: ["SL-modern-adirondack_white.png"] },
  { sku: "SL-modern-adirondack", colorName: "Charcoal", filenames: ["SL-modern-adirondack_charcoal.png"] },
  { sku: "SL-modern-adirondack", colorName: "Dove Grey", filenames: ["SL-modern-adirondack_dove-grey.png"] },
  { sku: "SL-modern-adirondack", colorName: "Sea Glass", filenames: ["SL-modern-adirondack_sea-glass.png"] },
  { sku: "SL-modern-adirondack", colorName: "Weatherwood", filenames: ["SL-modern-adirondack_weatherwood.png"] },
  // SL-adirondack-tete-a-tete
  { sku: "SL-adirondack-tete-a-tete", colorName: "Black", filenames: ["SL-adirondack-tete-a-tete_black.png"] },
  { sku: "SL-adirondack-tete-a-tete", colorName: "White", filenames: ["SL-adirondack-tete-a-tete_white.png"] },
  { sku: "SL-adirondack-tete-a-tete", colorName: "Charcoal", filenames: ["SL-adirondack-tete-a-tete_charcoal.png"] },
  { sku: "SL-adirondack-tete-a-tete", colorName: "Dove Grey", filenames: ["SL-adirondack-tete-a-tete_dove-grey.png"] },
  { sku: "SL-adirondack-tete-a-tete", colorName: "Sea Glass", filenames: ["SL-adirondack-tete-a-tete_sea-glass.png"] },
  { sku: "SL-adirondack-tete-a-tete", colorName: "Weatherwood", filenames: ["SL-adirondack-tete-a-tete_weatherwood.png"] },
  // SL-adirondack-dining-counter-bar-chair
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "Black", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-black.png", "SL-adirondack-dining-counter-bar-chair_black-counter-height.png"] },
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "White", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-white.png", "SL-adirondack-dining-counter-bar-chair_white-counter-height.png", "SL-adirondack-dining-counter-bar-chair_whtie.png"] },
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "Charcoal", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-charcoal.png", "SL-adirondack-dining-counter-bar-chair_charcoal-counter-height.png", "SL-adirondack-dining-counter-bar-chair_charcoal.png"] },
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "Dove Grey", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-dove-grey.png", "SL-adirondack-dining-counter-bar-chair_dove-grey-counter-height.png"] },
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "Sea Glass", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-sea-glass.png", "SL-adirondack-dining-counter-bar-chair_sea-glass-counter-height.png", "SL-adirondack-dining-counter-bar-chair_sea-glass.png"] },
  { sku: "SL-adirondack-dining-counter-bar-chair", colorName: "Weatherwood", filenames: ["SL-adirondack-dining-counter-bar-chair_bar-height-weatherwood.png", "SL-adirondack-dining-counter-bar-chair_weatherwood-counter-height.png", "SL-adirondack-dining-counter-bar-chair_weatherwood.png"] },
  // SL-abaco-club-chair
  { sku: "SL-abaco-club-chair", colorName: "Black", filenames: ["SL-abaco-club-chair_black.png"] },
  { sku: "SL-abaco-club-chair", colorName: "White", filenames: ["SL-abaco-club-chair_white.png"] },
  { sku: "SL-abaco-club-chair", colorName: "Charcoal", filenames: ["SL-abaco-club-chair_charcoal.png"] },
  { sku: "SL-abaco-club-chair", colorName: "Dove Grey", filenames: ["SL-abaco-club-chair_dove-grey.png"] },
  { sku: "SL-abaco-club-chair", colorName: "Sea Glass", filenames: ["SL-abaco-club-chair_sea-glass.png"] },
  { sku: "SL-abaco-club-chair", colorName: "Weatherwood", filenames: ["SL-abaco-club-chair_weatherwood.png"] },
  // SL-abaco-swivel-club
  { sku: "SL-abaco-swivel-club", colorName: "Black", filenames: ["SL-abaco-swivel-club_black.png"] },
  { sku: "SL-abaco-swivel-club", colorName: "White", filenames: ["SL-abaco-swivel-club_white.png"] },
  { sku: "SL-abaco-swivel-club", colorName: "Charcoal", filenames: ["SL-abaco-swivel-club_charcoal.png"] },
  { sku: "SL-abaco-swivel-club", colorName: "Dove Grey", filenames: ["SL-abaco-swivel-club_dove-grey.png"] },
  { sku: "SL-abaco-swivel-club", colorName: "Sea Glass", filenames: ["SL-abaco-swivel-club_sea-glass.png"] },
  { sku: "SL-abaco-swivel-club", colorName: "Weatherwood", filenames: ["SL-abaco-swivel-club_weatherwood.png"] },
  // SL-high-back-abaco-swivel-club-chair
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "Black", filenames: ["SL-high-back-abaco-swivel-club-chair_black.png"] },
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "White", filenames: ["SL-high-back-abaco-swivel-club-chair_white.png"] },
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "Charcoal", filenames: ["SL-high-back-abaco-swivel-club-chair_charcoal.png"] },
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "Dove Grey", filenames: ["SL-high-back-abaco-swivel-club-chair_dove-grey.png"] },
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "Sea Glass", filenames: ["SL-high-back-abaco-swivel-club-chair_sea-glass.png"] },
  { sku: "SL-high-back-abaco-swivel-club-chair", colorName: "Weatherwood", filenames: ["SL-high-back-abaco-swivel-club-chair_weatherwood.png"] },
  // SL-abaco-ottoman
  { sku: "SL-abaco-ottoman", colorName: "Black", filenames: ["SL-abaco-ottoman_black.png"] },
  { sku: "SL-abaco-ottoman", colorName: "White", filenames: ["SL-abaco-ottoman_white.png"] },
  { sku: "SL-abaco-ottoman", colorName: "Charcoal", filenames: ["SL-abaco-ottoman_charcoal.png"] },
  { sku: "SL-abaco-ottoman", colorName: "Dove Grey", filenames: ["SL-abaco-ottoman_dove-grey.png"] },
  { sku: "SL-abaco-ottoman", colorName: "Sea Glass", filenames: ["SL-abaco-ottoman_sea-glass.png"] },
  { sku: "SL-abaco-ottoman", colorName: "Weatherwood", filenames: ["SL-abaco-ottoman_weatherwood.png"] },
  // SL-abaco-deep-seating-sofa
  { sku: "SL-abaco-deep-seating-sofa", colorName: "Black", filenames: ["SL-abaco-deep-seating-sofa_black.png"] },
  { sku: "SL-abaco-deep-seating-sofa", colorName: "White", filenames: ["SL-abaco-deep-seating-sofa_white.png"] },
  { sku: "SL-abaco-deep-seating-sofa", colorName: "Charcoal", filenames: ["SL-abaco-deep-seating-sofa_charcoal.png"] },
  { sku: "SL-abaco-deep-seating-sofa", colorName: "Dove Grey", filenames: ["SL-abaco-deep-seating-sofa_dove-grey.png"] },
  { sku: "SL-abaco-deep-seating-sofa", colorName: "Sea Glass", filenames: ["SL-abaco-deep-seating-sofa_sea-glass.png"] },
  { sku: "SL-abaco-deep-seating-sofa", colorName: "Weatherwood", filenames: ["SL-abaco-deep-seating-sofa_weatherwood.png"] },
  // SL-abaco-high-back-deep-seating
  { sku: "SL-abaco-high-back-deep-seating", colorName: "Black", filenames: ["SL-abaco-high-back-deep-seating_black.png"] },
  { sku: "SL-abaco-high-back-deep-seating", colorName: "White", filenames: ["SL-abaco-high-back-deep-seating_white.png"] },
  { sku: "SL-abaco-high-back-deep-seating", colorName: "Charcoal", filenames: ["SL-abaco-high-back-deep-seating_charcoal.png"] },
  { sku: "SL-abaco-high-back-deep-seating", colorName: "Dove Grey", filenames: ["SL-abaco-high-back-deep-seating_dove-grey.png"] },
  { sku: "SL-abaco-high-back-deep-seating", colorName: "Sea Glass", filenames: ["SL-abaco-high-back-deep-seating_sea-glass.png"] },
  { sku: "SL-abaco-high-back-deep-seating", colorName: "Weatherwood", filenames: ["SL-abaco-high-back-deep-seating_weatherwood.png"] },
  // SL-abaco-sectional
  { sku: "SL-abaco-sectional", colorName: "Black", filenames: ["SL-abaco-sectional_black.png"] },
  { sku: "SL-abaco-sectional", colorName: "White", filenames: ["SL-abaco-sectional_white.png"] },
  { sku: "SL-abaco-sectional", colorName: "Charcoal", filenames: ["SL-abaco-sectional_charcoal.png"] },
  { sku: "SL-abaco-sectional", colorName: "Dove Grey", filenames: ["SL-abaco-sectional_dove-grey.png"] },
  { sku: "SL-abaco-sectional", colorName: "Sea Glass", filenames: ["SL-abaco-sectional_sea-glass.png"] },
  { sku: "SL-abaco-sectional", colorName: "Weatherwood", filenames: ["SL-abaco-sectional_weatherwood.png"] },
  // SL-abaco-loveseat
  { sku: "SL-abaco-loveseat", colorName: "Black", filenames: ["SL-abaco-loveseat_black.png"] },
  { sku: "SL-abaco-loveseat", colorName: "White", filenames: ["SL-abaco-loveseat_white.png"] },
  { sku: "SL-abaco-loveseat", colorName: "Charcoal", filenames: ["SL-abaco-loveseat_charcoal.png"] },
  { sku: "SL-abaco-loveseat", colorName: "Dove Grey", filenames: ["SL-abaco-loveseat_dove-grey.png"] },
  { sku: "SL-abaco-loveseat", colorName: "Sea Glass", filenames: ["SL-abaco-loveseat_sea-glass.png"] },
  { sku: "SL-abaco-loveseat", colorName: "Weatherwood", filenames: ["SL-abaco-loveseat_weatherwood.png"] },
  // SL-high-back-abaco-club
  { sku: "SL-high-back-abaco-club", colorName: "Black", filenames: ["SL-high-back-abaco-club_black.png"] },
  { sku: "SL-high-back-abaco-club", colorName: "White", filenames: ["SL-high-back-abaco-club_white.png"] },
  { sku: "SL-high-back-abaco-club", colorName: "Charcoal", filenames: ["SL-high-back-abaco-club_charcoal.png"] },
  { sku: "SL-high-back-abaco-club", colorName: "Dove Grey", filenames: ["SL-high-back-abaco-club_dove-grey.png"] },
  { sku: "SL-high-back-abaco-club", colorName: "Sea Glass", filenames: ["SL-high-back-abaco-club_sea-glass.png"] },
  { sku: "SL-high-back-abaco-club", colorName: "Weatherwood", filenames: ["SL-high-back-abaco-club_weatherwood.png"] },
  // SL-hopetown-armless-chaise
  { sku: "SL-hopetown-armless-chaise", colorName: "Black", filenames: ["SL-hopetown-armless-chaise_black.png"] },
  { sku: "SL-hopetown-armless-chaise", colorName: "White", filenames: ["SL-hopetown-armless-chaise_white.png"] },
  { sku: "SL-hopetown-armless-chaise", colorName: "Charcoal", filenames: ["SL-hopetown-armless-chaise_charcoal.png"] },
  { sku: "SL-hopetown-armless-chaise", colorName: "Dove Grey", filenames: ["SL-hopetown-armless-chaise_dove-grey.png"] },
  { sku: "SL-hopetown-armless-chaise", colorName: "Sea Glass", filenames: ["SL-hopetown-armless-chaise_sea-glass.png"] },
  { sku: "SL-hopetown-armless-chaise", colorName: "Weatherwood", filenames: ["SL-hopetown-armless-chaise_weatherwood.png"] },
  // SL-hopetown-arm-chaise
  { sku: "SL-hopetown-arm-chaise", colorName: "Black", filenames: ["SL-hopetown-arm-chaise_black.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "White", filenames: ["SL-hopetown-arm-chaise_white.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "Charcoal", filenames: ["SL-hopetown-arm-chaise_charcoal.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "Dove Grey", filenames: ["SL-hopetown-arm-chaise_dove-grey.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "Sea Glass", filenames: ["SL-hopetown-arm-chaise_sea-glass.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "Weatherwood", filenames: ["SL-hopetown-arm-chaise_weatherwood.png"] },
  { sku: "SL-hopetown-arm-chaise", colorName: "Two Tone", filenames: ["SL-hopetown-arm-chaise_two-tone.png"] },
  // SL-hopetown-arm-chaise-with-cushion
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "Black", filenames: ["SL-hopetown-arm-chaise-with-cushion_black.png"] },
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "White", filenames: ["SL-hopetown-arm-chaise-with-cushion_white.png"] },
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "Charcoal", filenames: ["SL-hopetown-arm-chaise-with-cushion_charcoal.png"] },
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "Dove Grey", filenames: ["SL-hopetown-arm-chaise-with-cushion_dove-grey.png"] },
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "Sea Glass", filenames: ["SL-hopetown-arm-chaise-with-cushion_sea-glass.png"] },
  { sku: "SL-hopetown-arm-chaise-with-cushion", colorName: "Weatherwood", filenames: ["SL-hopetown-arm-chaise-with-cushion_weatherwood.png"] },
  // SL-hopetown-armless-chaise-with-cushion
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "Black", filenames: ["SL-hopetown-armless-chaise-with-cushion_black.png"] },
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "White", filenames: ["SL-hopetown-armless-chaise-with-cushion_white.png"] },
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "Charcoal", filenames: ["SL-hopetown-armless-chaise-with-cushion_charcoal.png"] },
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "Dove Grey", filenames: ["SL-hopetown-armless-chaise-with-cushion_dove-grey.png"] },
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "Sea Glass", filenames: ["SL-hopetown-armless-chaise-with-cushion_sea-glass.png"] },
  { sku: "SL-hopetown-armless-chaise-with-cushion", colorName: "Weatherwood", filenames: ["SL-hopetown-armless-chaise-with-cushion_weatherwood.png"] },
  // SL-cafe-arm-dining-counter-bar-chair
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Black", filenames: ["SL-cafe-arm-dining-counter-bar-chair_black-bar.png", "SL-cafe-arm-dining-counter-bar-chair_black-counter.png", "SL-cafe-arm-dining-counter-bar-chair_black-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "White", filenames: ["SL-cafe-arm-dining-counter-bar-chair_white-bar.png", "SL-cafe-arm-dining-counter-bar-chair_white-counter.png", "SL-cafe-arm-dining-counter-bar-chair_white-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Charcoal", filenames: ["SL-cafe-arm-dining-counter-bar-chair_charcoal-bar.png", "SL-cafe-arm-dining-counter-bar-chair_charcoal-counter.png", "SL-cafe-arm-dining-counter-bar-chair_charcoal-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Dove Grey", filenames: ["SL-cafe-arm-dining-counter-bar-chair_dove-grey-bar.png", "SL-cafe-arm-dining-counter-bar-chair_dove-grey-counter.png", "SL-cafe-arm-dining-counter-bar-chair_dove-grey-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Sea Glass", filenames: ["SL-cafe-arm-dining-counter-bar-chair_sea-glass-bar.png", "SL-cafe-arm-dining-counter-bar-chair_sea-glass-counter.png", "SL-cafe-arm-dining-counter-bar-chair_sea-glass-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Weatherwood", filenames: ["SL-cafe-arm-dining-counter-bar-chair_weatherwood-bar.png", "SL-cafe-arm-dining-counter-bar-chair_weatherwood-counter.png", "SL-cafe-arm-dining-counter-bar-chair_weatherwood-dining.png"] },
  { sku: "SL-cafe-arm-dining-counter-bar-chair", colorName: "Two Tone", filenames: ["SL-cafe-arm-dining-counter-bar-chair_two-tone-counter.png", "SL-cafe-arm-dining-counter-bar-chair_two-tone-dining.png"] },
  // SL-cafe-armless-dining-counter-bar-chair
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Black", filenames: ["SL-cafe-armless-dining-counter-bar-chair_black-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_black-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_black.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "White", filenames: ["SL-cafe-armless-dining-counter-bar-chair_white-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_white-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_white.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Charcoal", filenames: ["SL-cafe-armless-dining-counter-bar-chair_charcoal-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_charcoal-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_charcoal.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Dove Grey", filenames: ["SL-cafe-armless-dining-counter-bar-chair_dove-grey-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_dove-grey-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_dove-grey.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Sea Glass", filenames: ["SL-cafe-armless-dining-counter-bar-chair_sea-glass-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_sea-glass-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_sea-glass.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Weatherwood", filenames: ["SL-cafe-armless-dining-counter-bar-chair_weatherwood-bar-height.png", "SL-cafe-armless-dining-counter-bar-chair_weatherwood-counter-height.png", "SL-cafe-armless-dining-counter-bar-chair_weatherwood.png"] },
  { sku: "SL-cafe-armless-dining-counter-bar-chair", colorName: "Two Tone", filenames: ["SL-cafe-armless-dining-counter-bar-chair_two-tone-counter-height.png"] },
  // SL-hopetown-dining-counter-bar-chair
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Black", filenames: ["SL-hopetown-dining-counter-bar-chair_black-bar.png", "SL-hopetown-dining-counter-bar-chair_black-counter.png", "SL-hopetown-dining-counter-bar-chair_black-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "White", filenames: ["SL-hopetown-dining-counter-bar-chair_white-bar.png", "SL-hopetown-dining-counter-bar-chair_white-counter.png", "SL-hopetown-dining-counter-bar-chair_white-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Charcoal", filenames: ["SL-hopetown-dining-counter-bar-chair_charcoal-bar.png", "SL-hopetown-dining-counter-bar-chair_charcoal-counter.png", "SL-hopetown-dining-counter-bar-chair_charcoal-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Dove Grey", filenames: ["SL-hopetown-dining-counter-bar-chair_dove-grey-bar.png", "SL-hopetown-dining-counter-bar-chair_dove-grey-counter.png", "SL-hopetown-dining-counter-bar-chair_dove-grey-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Sea Glass", filenames: ["SL-hopetown-dining-counter-bar-chair_sea-glass-bar.png", "SL-hopetown-dining-counter-bar-chair_sea-glass-counter.png", "SL-hopetown-dining-counter-bar-chair_sea-glass-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Weatherwood", filenames: ["SL-hopetown-dining-counter-bar-chair_weatherwood-bar.png", "SL-hopetown-dining-counter-bar-chair_weatherwood-counter.png", "SL-hopetown-dining-counter-bar-chair_weatherwood-dining.png"] },
  { sku: "SL-hopetown-dining-counter-bar-chair", colorName: "Two Tone", filenames: ["SL-hopetown-dining-counter-bar-chair_two-tone-counter.png", "SL-hopetown-dining-counter-bar-chair_two-tone-dining.png"] },
  // SL-round-dining-table
  { sku: "SL-round-dining-table", colorName: "Black", filenames: ["SL-round-dining-table_black.png"] },
  { sku: "SL-round-dining-table", colorName: "White", filenames: ["SL-round-dining-table_white.png"] },
  { sku: "SL-round-dining-table", colorName: "Charcoal", filenames: ["SL-round-dining-table_charcoal.png"] },
  { sku: "SL-round-dining-table", colorName: "Dove Grey", filenames: ["SL-round-dining-table_dove-grey.png"] },
  { sku: "SL-round-dining-table", colorName: "Sea Glass", filenames: ["SL-round-dining-table_sea-glass.png"] },
  { sku: "SL-round-dining-table", colorName: "Weatherwood", filenames: ["SL-round-dining-table_weatherwood.png"] },
  { sku: "SL-round-dining-table", colorName: "Two Tone", filenames: ["SL-round-dining-table_two-tone.png"] },
  // SL-square-dining-table
  { sku: "SL-square-dining-table", colorName: "Black", filenames: ["SL-square-dining-table_black.png"] },
  { sku: "SL-square-dining-table", colorName: "White", filenames: ["SL-square-dining-table_white.png"] },
  { sku: "SL-square-dining-table", colorName: "Charcoal", filenames: ["SL-square-dining-table_charcoal.png"] },
  { sku: "SL-square-dining-table", colorName: "Dove Grey", filenames: ["SL-square-dining-table_dove-grey.png"] },
  { sku: "SL-square-dining-table", colorName: "Sea Glass", filenames: ["SL-square-dining-table_sea-glass.png"] },
  { sku: "SL-square-dining-table", colorName: "Weatherwood", filenames: ["SL-square-dining-table_weatherwood.png"] },
  { sku: "SL-square-dining-table", colorName: "Two Tone", filenames: ["SL-square-dining-table_two-tone.png"] },
  // SL-oval-dining-table
  { sku: "SL-oval-dining-table", colorName: "Black", filenames: ["SL-oval-dining-table_black.png"] },
  { sku: "SL-oval-dining-table", colorName: "White", filenames: ["SL-oval-dining-table_white.png"] },
  { sku: "SL-oval-dining-table", colorName: "Charcoal", filenames: ["SL-oval-dining-table_charcoal.png"] },
  { sku: "SL-oval-dining-table", colorName: "Dove Grey", filenames: ["SL-oval-dining-table_dove-grey.png"] },
  { sku: "SL-oval-dining-table", colorName: "Sea Glass", filenames: ["SL-oval-dining-table_sea-glass.png"] },
  { sku: "SL-oval-dining-table", colorName: "Weatherwood", filenames: ["SL-oval-dining-table_weatherwood.png"] },
  // SL-rectangle-dining-table
  { sku: "SL-rectangle-dining-table", colorName: "Black", filenames: ["SL-rectangle-dining-table_black.png"] },
  { sku: "SL-rectangle-dining-table", colorName: "White", filenames: ["SL-rectangle-dining-table_white.png"] },
  { sku: "SL-rectangle-dining-table", colorName: "Charcoal", filenames: ["SL-rectangle-dining-table_charcoal.png"] },
  { sku: "SL-rectangle-dining-table", colorName: "Dove Grey", filenames: ["SL-rectangle-dining-table_dove-grey.png"] },
  { sku: "SL-rectangle-dining-table", colorName: "Sea Glass", filenames: ["SL-rectangle-dining-table_sea-glass.png"] },
  { sku: "SL-rectangle-dining-table", colorName: "Weatherwood", filenames: ["SL-rectangle-dining-table_weatherwood.png"] },
  // SL-counter-height-stool
  { sku: "SL-counter-height-stool", colorName: "Black", filenames: ["SL-counter-height-stool_black.png"] },
  { sku: "SL-counter-height-stool", colorName: "White", filenames: ["SL-counter-height-stool_white.png"] },
  { sku: "SL-counter-height-stool", colorName: "Charcoal", filenames: ["SL-counter-height-stool_charcoal.png"] },
  { sku: "SL-counter-height-stool", colorName: "Dove Grey", filenames: ["SL-counter-height-stool_dove-grey.png"] },
  { sku: "SL-counter-height-stool", colorName: "Sea Glass", filenames: ["SL-counter-height-stool_sea-glass.png"] },
  { sku: "SL-counter-height-stool", colorName: "Weatherwood", filenames: ["SL-counter-height-stool_weatherwood.png"] },
  // SL-dining-bench
  { sku: "SL-dining-bench", colorName: "Black", filenames: ["SL-dining-bench_black.png"] },
  { sku: "SL-dining-bench", colorName: "White", filenames: ["SL-dining-bench_white.png"] },
  { sku: "SL-dining-bench", colorName: "Charcoal", filenames: ["SL-dining-bench_charcoal.png"] },
  { sku: "SL-dining-bench", colorName: "Dove Grey", filenames: ["SL-dining-bench_dove-grey.png"] },
  { sku: "SL-dining-bench", colorName: "Sea Glass", filenames: ["SL-dining-bench_sea-glass.png"] },
  { sku: "SL-dining-bench", colorName: "Weatherwood", filenames: ["SL-dining-bench_weatherwood.png"] },
  // SL-hampton-round-end-table
  { sku: "SL-hampton-round-end-table", colorName: "Black", filenames: ["SL-hampton-round-end-table_black.png"] },
  { sku: "SL-hampton-round-end-table", colorName: "White", filenames: ["SL-hampton-round-end-table_white.png"] },
  { sku: "SL-hampton-round-end-table", colorName: "Charcoal", filenames: ["SL-hampton-round-end-table_charcoal.png"] },
  { sku: "SL-hampton-round-end-table", colorName: "Dove Grey", filenames: ["SL-hampton-round-end-table_dove-grey.png"] },
  { sku: "SL-hampton-round-end-table", colorName: "Sea Glass", filenames: ["SL-hampton-round-end-table_sea-glass.png"] },
  { sku: "SL-hampton-round-end-table", colorName: "Weatherwood", filenames: ["SL-hampton-round-end-table_weatherwood.png"] },
  // SL-hampton-end-table-square
  { sku: "SL-hampton-end-table-square", colorName: "Black", filenames: ["SL-hampton-end-table-square_black.png"] },
  { sku: "SL-hampton-end-table-square", colorName: "White", filenames: ["SL-hampton-end-table-square_white.png"] },
  { sku: "SL-hampton-end-table-square", colorName: "Charcoal", filenames: ["SL-hampton-end-table-square_charcoal.png"] },
  { sku: "SL-hampton-end-table-square", colorName: "Dove Grey", filenames: ["SL-hampton-end-table-square_dove-grey.png"] },
  { sku: "SL-hampton-end-table-square", colorName: "Sea Glass", filenames: ["SL-hampton-end-table-square_sea-glass.png"] },
  { sku: "SL-hampton-end-table-square", colorName: "Weatherwood", filenames: ["SL-hampton-end-table-square_weatherwood.png"] },
  // SL-console-table
  { sku: "SL-console-table", colorName: "Black", filenames: ["SL-console-table_black.png"] },
  { sku: "SL-console-table", colorName: "White", filenames: ["SL-console-table_white.png"] },
  { sku: "SL-console-table", colorName: "Charcoal", filenames: ["SL-console-table_charcoal.png"] },
  { sku: "SL-console-table", colorName: "Dove Grey", filenames: ["SL-console-table_dove-grey.png"] },
  { sku: "SL-console-table", colorName: "Sea Glass", filenames: ["SL-console-table_sea-glass.png"] },
  { sku: "SL-console-table", colorName: "Weatherwood", filenames: ["SL-console-table_weatherwood.png"] },
  // SL-square-end-table-with-grooves
  { sku: "SL-square-end-table-with-grooves", colorName: "Black", filenames: ["SL-square-end-table-with-grooves_black.png"] },
  { sku: "SL-square-end-table-with-grooves", colorName: "White", filenames: ["SL-square-end-table-with-grooves_white.png"] },
  { sku: "SL-square-end-table-with-grooves", colorName: "Charcoal", filenames: ["SL-square-end-table-with-grooves_charcoal.png"] },
  { sku: "SL-square-end-table-with-grooves", colorName: "Dove Grey", filenames: ["SL-square-end-table-with-grooves_dove-grey.png"] },
  { sku: "SL-square-end-table-with-grooves", colorName: "Sea Glass", filenames: ["SL-square-end-table-with-grooves_sea-glass.png"] },
  { sku: "SL-square-end-table-with-grooves", colorName: "Weatherwood", filenames: ["SL-square-end-table-with-grooves_weatherwood.png"] },
  // SL-round-coffee-table
  { sku: "SL-round-coffee-table", colorName: "Black", filenames: ["SL-round-coffee-table_black.png"] },
  { sku: "SL-round-coffee-table", colorName: "White", filenames: ["SL-round-coffee-table_white.png"] },
  { sku: "SL-round-coffee-table", colorName: "Charcoal", filenames: ["SL-round-coffee-table_charcoal.png"] },
  { sku: "SL-round-coffee-table", colorName: "Dove Grey", filenames: ["SL-round-coffee-table_dove-grey.png"] },
  { sku: "SL-round-coffee-table", colorName: "Sea Glass", filenames: ["SL-round-coffee-table_sea-glass.png"] },
  { sku: "SL-round-coffee-table", colorName: "Weatherwood", filenames: ["SL-round-coffee-table_weatherwood.png"] },
  // SL-rectangle-coffee-table
  { sku: "SL-rectangle-coffee-table", colorName: "Black", filenames: ["SL-rectangle-coffee-table_black.png"] },
  { sku: "SL-rectangle-coffee-table", colorName: "White", filenames: ["SL-rectangle-coffee-table_white.png"] },
  { sku: "SL-rectangle-coffee-table", colorName: "Charcoal", filenames: ["SL-rectangle-coffee-table_charcoal.png"] },
  { sku: "SL-rectangle-coffee-table", colorName: "Dove Grey", filenames: ["SL-rectangle-coffee-table_dove-grey.png"] },
  { sku: "SL-rectangle-coffee-table", colorName: "Sea Glass", filenames: ["SL-rectangle-coffee-table_sea-glass.png"] },
  { sku: "SL-rectangle-coffee-table", colorName: "Weatherwood", filenames: ["SL-rectangle-coffee-table_weatherwood.png"] },
  // SL-balcony-table
  { sku: "SL-balcony-table", colorName: "Black", filenames: ["SL-balcony-table_black.png"] },
  { sku: "SL-balcony-table", colorName: "White", filenames: ["SL-balcony-table_white.png"] },
  { sku: "SL-balcony-table", colorName: "Charcoal", filenames: ["SL-balcony-table_charcoal.png"] },
  { sku: "SL-balcony-table", colorName: "Dove Grey", filenames: ["SL-balcony-table_dove-grey.png"] },
  { sku: "SL-balcony-table", colorName: "Sea Glass", filenames: ["SL-balcony-table_sea-glass.png"] },
  { sku: "SL-balcony-table", colorName: "Weatherwood", filenames: ["SL-balcony-table_weatherwood.png"] },
  // SL-spa-steps
  { sku: "SL-spa-steps", colorName: "Black", filenames: ["SL-spa-steps_black.png"] },
  { sku: "SL-spa-steps", colorName: "Sea Glass", filenames: ["SL-spa-steps_sea-glass.png"] },
  { sku: "SL-spa-steps", colorName: "Weatherwood", filenames: ["SL-spa-steps_weatherwood.png"] },
  // SL-spa-stool
  { sku: "SL-spa-stool", colorName: "Black", filenames: ["SL-spa-stool_black.png"] },
  { sku: "SL-spa-stool", colorName: "White", filenames: ["SL-spa-stool_white.png"] },
  { sku: "SL-spa-stool", colorName: "Charcoal", filenames: ["SL-spa-stool_charcoal.png"] },
  { sku: "SL-spa-stool", colorName: "Dove Grey", filenames: ["SL-spa-stool_dove-grey.png"] },
  { sku: "SL-spa-stool", colorName: "Sea Glass", filenames: ["SL-spa-stool_sea-glass.png"] },
  { sku: "SL-spa-stool", colorName: "Weatherwood", filenames: ["SL-spa-stool_weatherwood.png"] },
  { sku: "SL-spa-stool", colorName: "Two Tone", filenames: ["SL-spa-stool_two-tone.png"] },
  // SL-spa-table (original filenames per CSV notes)
  { sku: "SL-spa-table", colorName: "Black", filenames: ["SL-spa-table_image.png"] },
  { sku: "SL-spa-table", colorName: "White", filenames: ["SL-spa-table_image-6.png"] },
  { sku: "SL-spa-table", colorName: "Charcoal", filenames: ["SL-spa-table_image-2.png"] },
  { sku: "SL-spa-table", colorName: "Dove Grey", filenames: ["SL-spa-table_image-3.png"] },
  { sku: "SL-spa-table", colorName: "Sea Glass", filenames: ["SL-spa-table_image-5.png"] },
  { sku: "SL-spa-table", colorName: "Weatherwood", filenames: ["SL-spa-table_image-4.png"] },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Loading Shoreline finishes from DB…");

  // Build finish name → id map for Shoreline
  const finishRows = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(sql`${finishesTable.manufacturerId} = ${SHORELINE_MFR_ID} AND ${finishesTable.isActive} = true`);
  const finishByName = new Map<string, number>();
  for (const f of finishRows) {
    finishByName.set(f.name, f.id);
  }
  console.log(`  Found ${finishByName.size} Shoreline finishes: ${[...finishByName.keys()].join(", ")}`);

  // Build product sku → id map for all SL- products
  const productSkus = [...new Set(PRODUCT_COLOR_IMAGES.map((r) => r.sku))];
  const productRows = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, productSkus));
  const productBySkuMap = new Map<string, number>();
  for (const p of productRows) {
    productBySkuMap.set(p.sku, p.id);
  }
  console.log(`  Found ${productBySkuMap.size} / ${productSkus.length} products in DB`);

  // ── Step 1: Insert product_finish_options ──────────────────────────────────
  console.log("\nStep 1: Inserting product_finish_options…");
  let optionInserted = 0;
  let optionSkipped = 0;

  // Collect unique (productId, finishId) pairs from the data
  const optionPairs = new Set<string>();
  for (const { sku, colorName } of PRODUCT_COLOR_IMAGES) {
    const productId = productBySkuMap.get(sku);
    const finishId = finishByName.get(colorName);
    if (!productId) { console.warn(`  SKIP product not found: ${sku}`); continue; }
    if (!finishId) { console.warn(`  SKIP finish not found: "${colorName}"`); continue; }
    optionPairs.add(`${productId}:${finishId}`);
  }

  for (const pair of optionPairs) {
    const [productId, finishId] = pair.split(":").map(Number);
    const result = await db.execute(
      sql`INSERT INTO product_finish_options (product_id, finish_id, display_order)
          VALUES (${productId}, ${finishId}, (
            SELECT COALESCE(MAX(display_order), -1) + 1
            FROM product_finish_options
            WHERE product_id = ${productId}
          ))
          ON CONFLICT (product_id, finish_id) DO NOTHING`,
    );
    if ((result.rowCount ?? 0) > 0) optionInserted++;
    else optionSkipped++;
  }
  console.log(`  Inserted: ${optionInserted}  Already existed: ${optionSkipped}`);

  // ── Step 1b: Ensure Shoreline finishes are classified as "Frame Finish" ──────
  // ProductOptionPickers uses description === "Frame Finish" to decide whether
  // to show the Frame Finish picker on the PDP. Shoreline finishes are plain
  // frame-color options, so they need this classification.
  const finishIds = Array.from(finishByName.values());
  if (finishIds.length > 0) {
    await db.execute(
      sql`UPDATE finishes SET description = 'Frame Finish'
          WHERE id = ANY(ARRAY[${sql.raw(finishIds.join(","))}]::int[])
            AND (description IS NULL OR description != 'Frame Finish')`,
    );
    console.log(`  Set description='Frame Finish' on ${finishIds.length} Shoreline finishes`);
  }

  // ── Step 2: Tag product_images with finish_id ──────────────────────────────
  console.log("\nStep 2: Tagging product_images with finish_id…");
  let imgTagged = 0;
  let imgNotFound = 0;

  for (const { sku, colorName, filenames } of PRODUCT_COLOR_IMAGES) {
    const productId = productBySkuMap.get(sku);
    const finishId = finishByName.get(colorName);
    if (!productId || !finishId) continue;

    for (const filename of filenames) {
      // Match by URL ending in /{filename} (case-insensitive for safety)
      const result = await db.execute(
        sql`UPDATE product_images
            SET finish_id = ${finishId}
            WHERE product_id = ${productId}
              AND finish_id IS NULL
              AND (url ILIKE ${"%" + filename}
                   OR url ILIKE ${"%" + filename.replace(/\.png$/i, ".jpg")}
                   OR url ILIKE ${"%" + filename.replace(/\.png$/i, ".jpeg")})`,
      );
      const count = result.rowCount ?? 0;
      if (count > 0) {
        imgTagged += count;
      } else {
        imgNotFound++;
        console.warn(`  NOT FOUND: sku=${sku} color=${colorName} file=${filename}`);
      }
    }
  }
  console.log(`  Tagged: ${imgTagged}  Not matched: ${imgNotFound}`);

  // ── Verification ────────────────────────────────────────────────────────────
  const untagged = await db.execute<{ product_id: number; sku: string; count: string }>(
    sql`SELECT pi.product_id, p.sku, COUNT(*) as count
        FROM product_images pi
        JOIN products p ON p.id = pi.product_id
        WHERE p.manufacturer_id = ${SHORELINE_MFR_ID}
          AND pi.finish_id IS NULL
          AND pi.image_kind = 'gallery'
        GROUP BY pi.product_id, p.sku
        ORDER BY p.sku`,
  );
  if (untagged.rows.length > 0) {
    console.warn(`\n⚠ ${untagged.rows.length} Shoreline products still have untagged gallery images:`);
    for (const r of untagged.rows) console.warn(`  ${r.sku}: ${r.count} untagged`);
  } else {
    console.log("\n✓ All Shoreline gallery images are tagged with a finish_id.");
  }

  const totalTagged = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM product_images pi
        JOIN products p ON p.id = pi.product_id
        WHERE p.manufacturer_id = ${SHORELINE_MFR_ID}
          AND pi.finish_id IS NOT NULL`,
  );
  console.log(`\nTotal Shoreline images with finish_id: ${totalTagged.rows[0]?.count ?? 0}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
