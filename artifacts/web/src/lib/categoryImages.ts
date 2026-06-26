import categoryShadeImg from "@/assets/category-shade.png";
import categoryLoungeImg from "@/assets/category-lounge.png";
import categoryDiningImg from "@/assets/category-dining.png";
import categoryLightingImg from "@/assets/category-lighting.png";
import categoryFireImg from "@/assets/category-fire.jpg";
import categoryDeepSeatingImg from "@/assets/category-deep-seating.jpg";
import categoryChaisseImg from "@/assets/category-chaise.png";
import categoryBasesImg from "@/assets/category-bases.png";
import categoryCommercialImg from "@/assets/category-commercial.png";
import categoryReplacementPartsImg from "@/assets/category-replacement-parts.jpg";
import categoryBarImg from "@/assets/category-bar.png";
import categoryCoffeeSideTablesImg from "@/assets/category-coffee-side-tables.png";
import categoryDaybedsImg from "@/assets/category-daybeds.png";
import categoryAccentPiecesImg from "@/assets/category-accessories.png";
import categoryAccessoriesImg from "@assets/accessories_category_image_1782496844450.png";
import categoryAdirondackImg from "@assets/Adirondack_category_image_1782496844450.png";
import categoryTablesImg from "@assets/tables_category_image_1782496844450.png";

export const CATEGORY_IMAGES: Record<string, string> = {
  "cat-umbrellas": categoryShadeImg,
  "cat-chaise-lounges": categoryChaisseImg,
  "cat-dining": categoryDiningImg,
  "cat-lighting": categoryLightingImg,
  "cat-fire-tables": categoryFireImg,
  "cat-deep-seating": categoryDeepSeatingImg,
  "cat-umbrella-bases": categoryBasesImg,
  "cat-commercial": categoryCommercialImg,
  "cat-replacement-parts": categoryReplacementPartsImg,
  "cat-bar": categoryBarImg,
  "cat-coffee-side-tables": categoryCoffeeSideTablesImg,
  "cat-daybeds": categoryDaybedsImg,
  "cat-accent-pieces": categoryAccentPiecesImg,
  accessories: categoryAccessoriesImg,
  adirondack: categoryAdirondackImg,
  tables: categoryTablesImg,
  shade: categoryShadeImg,
  lounge: categoryLoungeImg,
  dining: categoryDiningImg,
  lighting: categoryLightingImg,
  fire: categoryFireImg,
  "deep-seating": categoryDeepSeatingImg,
  commercial: categoryCommercialImg,
};

/** Resolve the best image for a category: DB imageUrl first, then the bundled
 * fallback keyed by slug. Returns undefined when neither is available. */
export function getCategoryImage(
  category: { slug: string; imageUrl?: string | null },
): string | undefined {
  return category.imageUrl ?? CATEGORY_IMAGES[category.slug];
}
