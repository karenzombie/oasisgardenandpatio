import tropitone from "@assets/tropitone-logo_1777762880085.jpg";
import shoreline from "@assets/shoreline-logo_1777762880085.webp";
import owlee from "@assets/owlee-logo_1777762880085.jpeg";
import coutureJardin from "@assets/coturejardin-logo_1777762880085.png";
import summerset from "@assets/summerset-logo_1777762880085.jpeg";
import sunbrella from "@assets/sunbrella-logo_1777762880085.jpeg";
import hanamint from "@assets/hanamint-logo_1777762880085.jpg";
import northcape from "@assets/northcape-logo_1777762880085.jpg";
import sunsetWest from "@assets/sunset-west-logo_1777762880085.jpeg";
import homecrest from "@assets/homecrest-logo_1777762880085.png";
import treasureGarden from "@assets/treasure-garden-logo_1777762880085.jpg";
import telescopeCasual from "@assets/TelescopeCasual-logo_1777762880085.png";

export interface BrandLogo {
  name: string;
  src: string;
}

// Canonical, ordered list used by the home page marquee + brand grid.
export const BRAND_LOGOS: BrandLogo[] = [
  { name: "Tropitone", src: tropitone },
  { name: "O.W. Lee", src: owlee },
  { name: "Hanamint", src: hanamint },
  { name: "Treasure Garden", src: treasureGarden },
  { name: "Sunbrella", src: sunbrella },
  { name: "Sunset West", src: sunsetWest },
  { name: "Telescope Casual", src: telescopeCasual },
  { name: "Homecrest", src: homecrest },
  { name: "NorthCape", src: northcape },
  { name: "Couture Jardin", src: coutureJardin },
  { name: "Summerset", src: summerset },
  { name: "Shoreline", src: shoreline },
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LOGO_BY_KEY: Record<string, string> = BRAND_LOGOS.reduce(
  (acc, b) => {
    acc[normalize(b.name)] = b.src;
    return acc;
  },
  {} as Record<string, string>,
);

// Alias keys for common variant spellings. Keys MUST be pre-normalized
// (lowercase, alphanumeric only) since lookups go through normalize().
const ALIAS_TO_NAME: Record<string, string> = {
  ow: "owlee",
  owleeoutdoor: "owlee",
  owleeinc: "owlee",
  treasuregardens: "treasuregarden",
  treasuregardeninc: "treasuregarden",
  sunsetwestoutdoor: "sunsetwest",
  sunsetwestfineoutdoorfurnishings: "sunsetwest",
  northcapeinternational: "northcape",
  telescope: "telescopecasual",
  couturejardine: "couturejardin",
  coturejardin: "couturejardin",
  hanamintinc: "hanamint",
  tropitonefurniture: "tropitone",
  homecrestoutdoorliving: "homecrest",
  summersetcasual: "summerset",
};

/**
 * Resolve a manufacturer name (any casing/punctuation) to a bundled brand
 * logo URL. Returns null if no match.
 */
export function getBrandLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = normalize(name);
  if (LOGO_BY_KEY[key]) return LOGO_BY_KEY[key];
  const aliasKey = ALIAS_TO_NAME[key];
  if (aliasKey && LOGO_BY_KEY[aliasKey]) return LOGO_BY_KEY[aliasKey];
  return null;
}
