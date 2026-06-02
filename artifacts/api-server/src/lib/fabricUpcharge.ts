/**
 * Sunbrella fabric GRADE upcharge for Treasure Garden products.
 *
 * Treasure Garden umbrellas priced with a Sunbrella canopy carry a per-item
 * grade upcharge on top of the product's base/sale price:
 *   - Grade B: +$100/item
 *   - Grade C: +$190/item
 *   - Grade A (and anything else): no change
 *
 * The upcharge ONLY applies when BOTH sides match: the product is made by
 * "Treasure Garden" AND the chosen fabric is made by "Sunbrella". Returns a
 * plain dollar number (not cents).
 */
export function fabricGradeUpcharge(
  productManufacturerName: string | null | undefined,
  fabricManufacturerName: string | null | undefined,
  fabricGrade: string | null | undefined,
): number {
  if (productManufacturerName !== "Treasure Garden") return 0;
  if (fabricManufacturerName !== "Sunbrella") return 0;
  switch ((fabricGrade ?? "").trim().toUpperCase()) {
    case "B":
      return 100;
    case "C":
      return 190;
    default:
      return 0;
  }
}
