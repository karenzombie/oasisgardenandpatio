/**
 * Static editorial brand copy shown in the header of each manufacturer page.
 * Sourced from the client-provided manufacturer_about spreadsheet. Keyed by
 * manufacturer SLUG (stable, taken from the route) rather than name, because
 * the storefront uses shortened display names (e.g. "Homecrest" vs the CSV's
 * "Homecrest Outdoor Living"). Manufacturers absent from this map simply fall
 * back to the plain title header — the layout degrades gracefully.
 */
export interface ManufacturerStat {
  label: string;
  value: string;
}

export interface ManufacturerAboutInfo {
  foundedYear?: string;
  location?: string;
  tagline: string;
  about: string;
  pills: string[];
  stats: ManufacturerStat[];
}

export const MANUFACTURER_ABOUT: Record<string, ManufacturerAboutInfo> = {
  "frankford-umbrellas": {
    foundedYear: "1898",
    location: "Mt. Laurel, New Jersey",
    tagline:
      "Premium commercial shade — ending the compromise between durability, affordability, and luxury",
    about:
      "Founded in 1898 by Samuel and Benjamin Frankford, this family-run business started as door-to-door rain umbrella repairmen and grew into one of America's leading commercial shade manufacturers. Now 125+ years in, they remain guided by the same principles of honest craft, real follow-through, and no shortcuts on quality.",
    pills: [
      "Founded 1898",
      "Family-owned",
      "Commercial grade",
      "Sustainable practices",
      "Umbrellas & cabanas",
    ],
    stats: [
      { label: "Years in Business", value: "125+" },
      { label: "Location", value: "Mt. Laurel, NJ" },
    ],
  },
  "galtech-international": {
    foundedYear: "1990s",
    location: "Camarillo, California",
    tagline:
      "Premium market umbrellas and shade products for dealers and consumers worldwide",
    about:
      "For over 30 years, Galtech's team of specialists has focused on making umbrella purchasing a great experience. Their shade products use the finest materials available — including stainless steel cables, patented auto-tilt mechanisms, six-layer marine-grade varnish on wood frames, and a top-tier Sunbrella fabric selection.",
    pills: [
      "30+ years in business",
      "Camarillo CA",
      "Aluminum & wood frames",
      "Sunbrella fabrics",
      "Patented auto-tilt",
      "Commercial grade",
    ],
    stats: [
      { label: "Years in Business", value: "30+" },
      { label: "Location", value: "Camarillo, CA" },
    ],
  },
  "couture-jardin": {
    foundedYear: "2010",
    location: "Fort Lauderdale, Florida",
    tagline:
      "Contemporary outdoor furniture with authentic design at a fair price",
    about:
      "Founded in 2010 by Canadian designer-entrepreneur Normand Couture and his son Philippe, Couture Jardin is a family-owned brand built on a passion for contemporary outdoor design. Headquartered in Fort Lauderdale with showrooms and warehouses across North America and Asia, they serve residential, commercial, and hospitality markets worldwide.",
    pills: [
      "Founded 2010",
      "Family-owned",
      "Fort Lauderdale FL",
      "Contemporary design",
      "Residential & commercial",
      "Hospitality",
    ],
    stats: [
      { label: "Founded", value: "2010" },
      { label: "Global Showrooms", value: "North America & Asia" },
    ],
  },
  hanamint: {
    foundedYear: "1993",
    location: "Greensboro, North Carolina",
    tagline:
      "The perfect choice for outdoor living decor — bringing style to the outdoors, one yard at a time",
    about:
      "Founded in 1993, Hanamint manufactures and distributes cast aluminum casual furniture and accessories, growing to become a leader in their market segment. They operate a 1.2 million sq. ft. manufacturing facility in Jiaxing, China along with two US distribution centers. Every piece includes a polyester powder-coat finish, stainless steel hardware, and nylon glides, with in-house design staff continually developing new styles and patented innovations.",
    pills: [
      "Founded 1993",
      "Cast aluminum",
      "Powder-coat finish",
      "Stainless steel hardware",
      "US distribution centers",
      "Design patents",
    ],
    stats: [
      { label: "Founded", value: "1993" },
      { label: "Manufacturing Facility", value: "1.2M sq. ft." },
      { label: "US Distribution Centers", value: "2" },
    ],
  },
  homecrest: {
    foundedYear: "1953",
    location: "Wadena, Minnesota",
    tagline:
      "A rich history of quality and classic design meets affordable luxury and versatile outdoor living",
    about:
      "Founded in 1953 in Wadena, Minnesota, Homecrest started as a retail furniture shop before expanding into manufacturing. They hold a notable industry first — the original swivel rocker mechanism, patented in 1956 — and were also the first outdoor furniture manufacturer to use Sunbrella fabrics. Still made in Wadena, MN today, they offer 30 collections spanning seating, tables, fire tables, and accessories.",
    pills: [
      "Founded 1953",
      "Made in USA",
      "Wadena MN",
      "First Sunbrella adopter",
      "30+ collections",
      "Aluminum & steel frames",
      "Fire tables",
    ],
    stats: [
      { label: "Founded", value: "1953" },
      { label: "Collections", value: "30+" },
      { label: "Location", value: "Wadena, MN" },
    ],
  },
  northcape: {
    foundedYear: "1998",
    tagline:
      "The perfect balance of classic designs and current trends at an exceptional value",
    about:
      "Since 1998, NorthCape has focused on delivering high-quality, stylish, and comfortable outdoor furniture at an affordable price — blending timeless design with current trends without sacrificing value.",
    pills: [
      "Founded 1998",
      "Classic & contemporary styles",
      "Affordable luxury",
      "Outdoor furniture",
    ],
    stats: [{ label: "Founded", value: "1998" }],
  },
  "o-w-lee": {
    foundedYear: "1947",
    location: "Comfort, Texas",
    tagline:
      "Heirloom-quality outdoor furniture and fire pits handcrafted in America since 1947",
    about:
      "Founded in 1947 by Oddist W. Lee as a wrought-iron gate maker for Southern California estates, O.W. Lee has grown into one of America's premier outdoor furniture manufacturers across four generations of family leadership. All production happens at their 450000 sq. ft. facility in Comfort, Texas, where artisans combine hand-forging and hammer-and-anvil techniques with robotic welding and CNC precision. Every frame goes through a five-step powder-coat process and all fire pits are ANSI and CSA certified.",
    pills: [
      "Founded 1947",
      "Family-owned 4 generations",
      "Made in USA",
      "Comfort TX",
      "Wrought iron & aluminum",
      "ANSI certified fire pits",
      "5-step powder coat",
      "ICFA Manufacturer of the Year",
    ],
    stats: [
      { label: "Founded", value: "1947" },
      { label: "Manufacturing Facility", value: "450,000 sq. ft." },
      { label: "ICFA Manufacturer of the Year", value: "2010, 2012–2017, 2020" },
    ],
  },
  shoreline: {
    foundedYear: "1979",
    location: "San Clemente, California",
    tagline:
      "West Coast-crafted Marine Grade Polymer furniture with 45 years of family patio expertise",
    about:
      "Shoreline Craftworks is a family business with roots going back to 1979, when they started as Palm Casual in Orlando, Florida, manufacturing and supplying patio furniture to hundreds of retailers nationwide. Today Shoreline is the only manufacturer of Marine Grade Polymer furniture on the West Coast, with their San Clemente location helping reduce freight costs and lead times for West Coast customers.",
    pills: [
      "Family-owned",
      "Founded 1979",
      "San Clemente CA",
      "Marine Grade Polymer",
      "West Coast manufacturer",
      "45+ years experience",
    ],
    stats: [
      { label: "Years in Business", value: "45+" },
      { label: "Location", value: "San Clemente, CA" },
    ],
  },
  summerset: {
    foundedYear: "2005",
    location: "March Air Reserve Base, California",
    tagline:
      "Premier provider of quality outdoor furniture with superior service and competitive pricing",
    about:
      "Founded in the United States with a focus on quality outdoor products, Summerset Casual expanded into specialty retail distribution in 2005 and grew rapidly by developing international manufacturing facilities alongside US and Canada warehouse centers. They back their products with a 10-year warranty on most patio furniture and accessories, building everything with high-quality aluminum, superior-grade wicker, and weather-resistant fabrics with hand-finished detailing.",
    pills: [
      "US & Canada warehousing",
      "10-year warranty",
      "Aluminum & wicker",
      "Hand-finished",
      "Weather-resistant fabrics",
      "Specialty retail",
    ],
    stats: [
      { label: "Warranty", value: "10 years" },
      { label: "Distribution", value: "US & Canada" },
    ],
  },
  "sunset-west": {
    tagline:
      "Handcrafted outdoor furniture built with passion, premium materials, and impeccable attention to detail",
    about:
      "Sunset West is Hooker Furnishings' outdoor living brand, bringing a century-old commitment to craft and quality to outdoor spaces. Each piece is constructed by master weavers and skilled sewers using only premium materials, with careful hand-finishing at every step to ensure lasting beauty and durability outdoors. Backed by Hooker Furnishings — one of America's leading publicly traded furniture companies, founded in 1924.",
    pills: [
      "Hooker Furnishings brand",
      "Master weavers",
      "Hand-finished",
      "Premium materials",
      "Deep seating & dining",
      "Indoor-outdoor style",
    ],
    stats: [{ label: "Hooker Furnishings Est.", value: "1924" }],
  },
  "telescope-casual": {
    foundedYear: "1903",
    location: "Granville, New York",
    tagline:
      "Producing quality outdoor furniture in the USA since 1903 — one of America's oldest family-owned manufacturers",
    about:
      "One of the oldest outdoor furniture manufacturers in America, Telescope Casual has been a family-owned and operated business since 1903. Over 120 years they have built a reputation for comfort, style, and world-class customer service. They manufacture a wide range of sling, cushion, Marine Grade Polymer, and strap collections alongside umbrellas, fire tables, and accessories — all made in the USA.",
    pills: [
      "Founded 1903",
      "Family-owned",
      "Made in USA",
      "120+ years",
      "Marine Grade Polymer",
      "Sunbrella fabrics",
      "ICFA Supplier of the Year",
    ],
    stats: [
      { label: "Founded", value: "1903" },
      { label: "Years in Business", value: "120+" },
      { label: "Location", value: "Granville, NY" },
    ],
  },
  "treasure-garden": {
    foundedYear: "1984",
    location: "Southern California",
    tagline:
      "The world's favorite shade — the widest selection of shade solutions in the industry",
    about:
      "Founded in 1984 and headquartered in Southern California, Treasure Garden has spent 40+ years building a reputation for top-quality, custom-made, handcrafted umbrellas. As a vertically integrated manufacturer they produce over 90% of their own components from raw materials, giving them full quality control at every stage. With 6000 employees and more than 25000 variations of shade solutions, they are one of the largest and most innovative umbrella manufacturers in the world.",
    pills: [
      "Founded 1984",
      "Southern California",
      "Custom handcrafted",
      "25000+ variations",
      "Vertically integrated",
      "Cantilevers & market umbrellas",
      "Umbrella lighting",
    ],
    stats: [
      { label: "Founded", value: "1984" },
      { label: "Product Variations", value: "25000+" },
      { label: "Employees", value: "6000" },
    ],
  },
  tropitone: {
    foundedYear: "1954",
    location: "Sarasota, Florida",
    tagline:
      "Beautifully crafted, time-tested furniture — commercial-quality standards brought to your backyard since 1954",
    about:
      "Founded in 1954 by a retired Lockheed Aircraft engineer in Sarasota, Florida, Tropitone started as a contract brand for hotels, motels, and resorts. As travelers fell in love with the furniture on vacation, demand for residential versions grew — and Tropitone raised the bar for the entire outdoor furniture industry by applying commercial-grade standards to the residential market. Now part of Brown Jordan International, they were also the first company to introduce powder-coat finishing to the outdoor furniture industry.",
    pills: [
      "Founded 1954",
      "Brown Jordan International",
      "Sarasota FL",
      "Commercial & residential",
      "First powder-coat in industry",
      "ICFA Manufacturer of the Year x6",
      "Fire pits & tables",
      "Basta Sole umbrellas",
    ],
    stats: [
      { label: "Founded", value: "1954" },
      { label: "Years in Business", value: "70+" },
      { label: "ICFA Manufacturer of the Year", value: "6 consecutive years" },
    ],
  },
};

export function getManufacturerAbout(
  slug: string | null | undefined,
): ManufacturerAboutInfo | null {
  if (!slug) return null;
  return MANUFACTURER_ABOUT[slug.toLowerCase()] ?? null;
}
