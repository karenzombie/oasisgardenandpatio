// California combined state + local sales tax rates, keyed by ZIP3 prefix.
//
// California's statewide base is 7.25%. Counties and cities add district
// taxes on top, producing combined rates between 7.25% and ~10.75% depending
// on jurisdiction. The table below maps the first 3 ZIP digits (which CDTFA
// uses to assign destination-based rates) to a representative combined rate
// for the dominant county in that prefix.
//
// This is a pragmatic in-app rate table — sufficient for jurisdiction-aware
// invoicing without taking a dependency on TaxJar/Avalara. Admins can still
// override the per-order tax amount from the order detail page when an exact
// CDTFA lookup is required.

export interface CaTaxJurisdiction {
  rate: number;
  label: string;
}

const CA_RATES: Record<string, CaTaxJurisdiction> = {
  // Los Angeles County region (900-908)
  "900": { rate: 0.0975, label: "Los Angeles, CA" },
  "901": { rate: 0.1025, label: "South LA / Inglewood, CA" },
  "902": { rate: 0.1025, label: "Inglewood / Hawthorne, CA" },
  "903": { rate: 0.0975, label: "Compton, CA" },
  "904": { rate: 0.1025, label: "Santa Monica, CA" },
  "905": { rate: 0.1025, label: "Long Beach / Torrance, CA" },
  "906": { rate: 0.1025, label: "Long Beach, CA" },
  "907": { rate: 0.1025, label: "Long Beach, CA" },
  "908": { rate: 0.1025, label: "Long Beach / Lakewood, CA" },
  // Northern LA County / Santa Clarita / Antelope Valley (910-913)
  "910": { rate: 0.1025, label: "Pasadena / SGV, CA" },
  "911": { rate: 0.1025, label: "Pasadena / Alhambra, CA" },
  "912": { rate: 0.0975, label: "Glendale, CA" },
  "913": { rate: 0.0925, label: "Santa Clarita / SFV, CA" },
  "914": { rate: 0.0925, label: "Van Nuys / SFV, CA" },
  "915": { rate: 0.0975, label: "Burbank, CA" },
  "916": { rate: 0.0925, label: "North Hollywood, CA" },
  "917": { rate: 0.1025, label: "El Monte, CA" },
  "918": { rate: 0.1025, label: "El Monte, CA" },
  "919": { rate: 0.0775, label: "San Diego (north county), CA" },
  // San Diego County (920-921)
  "920": { rate: 0.0775, label: "San Diego, CA" },
  "921": { rate: 0.0775, label: "San Diego, CA" },
  // Inland Empire (922-925)
  "922": { rate: 0.0875, label: "Palm Springs / Riverside, CA" },
  "923": { rate: 0.0875, label: "San Bernardino, CA" },
  "924": { rate: 0.0875, label: "San Bernardino, CA" },
  "925": { rate: 0.0875, label: "Riverside, CA" },
  // Orange County (926-928)
  "926": { rate: 0.0775, label: "Santa Ana / OC, CA" },
  "927": { rate: 0.0775, label: "Anaheim / OC, CA" },
  "928": { rate: 0.0775, label: "Anaheim / OC, CA" },
  // Ventura / Santa Barbara / Bakersfield (930-933)
  "930": { rate: 0.0725, label: "Oxnard / Ventura, CA" },
  "931": { rate: 0.0875, label: "Santa Barbara, CA" },
  "932": { rate: 0.0825, label: "Bakersfield, CA" },
  "933": { rate: 0.0825, label: "Bakersfield, CA" },
  // Central Coast (934-935)
  "934": { rate: 0.0775, label: "San Luis Obispo, CA" },
  "935": { rate: 0.0775, label: "Mojave / Kern, CA" },
  // Central Valley (936-939)
  "936": { rate: 0.0825, label: "Fresno, CA" },
  "937": { rate: 0.0825, label: "Fresno, CA" },
  "938": { rate: 0.0775, label: "Fresno, CA" },
  "939": { rate: 0.0875, label: "Salinas / Monterey, CA" },
  // Bay Area (940-949)
  "940": { rate: 0.0875, label: "San Francisco, CA" },
  "941": { rate: 0.0875, label: "San Francisco, CA" },
  "942": { rate: 0.0825, label: "Sacramento (central), CA" },
  "943": { rate: 0.0925, label: "Palo Alto / South Bay, CA" },
  "944": { rate: 0.0975, label: "San Mateo, CA" },
  "945": { rate: 0.1025, label: "Oakland / Alameda, CA" },
  "946": { rate: 0.1025, label: "Oakland, CA" },
  "947": { rate: 0.1025, label: "Berkeley, CA" },
  "948": { rate: 0.1025, label: "Richmond / Contra Costa, CA" },
  "949": { rate: 0.0925, label: "San Rafael / North Bay, CA" },
  // Sacramento Valley (950-959)
  "950": { rate: 0.0925, label: "San Jose, CA" },
  "951": { rate: 0.0925, label: "San Jose / Santa Clara, CA" },
  "952": { rate: 0.0775, label: "Stockton, CA" },
  "953": { rate: 0.0825, label: "Stockton, CA" },
  "954": { rate: 0.0875, label: "Santa Rosa / Sonoma, CA" },
  "955": { rate: 0.0775, label: "Eureka / North Coast, CA" },
  "956": { rate: 0.0875, label: "Sacramento, CA" },
  "957": { rate: 0.0775, label: "Sacramento, CA" },
  "958": { rate: 0.0775, label: "Sacramento, CA" },
  "959": { rate: 0.0775, label: "Marysville / Yuba, CA" },
  // Northern California (960-961)
  "960": { rate: 0.0725, label: "Redding / Shasta, CA" },
  "961": { rate: 0.0825, label: "South Lake Tahoe, CA" },
};

export const CA_BASE_RATE = 0.0725;

/** Look up the combined CA sales tax rate for a ZIP. */
export function lookupCaTaxRate(zip: string | null): CaTaxJurisdiction {
  if (zip) {
    const prefix = zip.replace(/\D/g, "").slice(0, 3);
    const hit = CA_RATES[prefix];
    if (hit) return hit;
  }
  return { rate: CA_BASE_RATE, label: "California (statewide base)" };
}
