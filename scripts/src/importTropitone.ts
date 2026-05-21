import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

function toTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface Row {
  collection: string;
  style: string;
  sku: string;
  piece: string;
  height: string;
  width: string;
  depth: string;
  seatHeight: string;
  armHeight: string;
}

const RAW: Row[] = [
  // Corsica – CUSHION
  { collection:"Corsica", style:"CUSHION",      sku:"171311",       piece:"LOUNGE CHAIR",                   height:"39",  width:"30.5", depth:"34.5", seatHeight:"19",   armHeight:"23.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"171325NT",     piece:"SWIVEL ACTION LOUNGER",           height:"39",  width:"30",   depth:"34",   seatHeight:"19",   armHeight:"23.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"171317",       piece:"OTTOMAN",                        height:"16.5",width:"30",   depth:"24",   seatHeight:"16.5", armHeight:"14" },
  { collection:"Corsica", style:"CUSHION",      sku:"171314",       piece:"LOVE SEAT",                      height:"39",  width:"55.5", depth:"34.5", seatHeight:"19",   armHeight:"23.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"171321",       piece:"SOFA",                           height:"39",  width:"80.5", depth:"34.5", seatHeight:"19",   armHeight:"23.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"171310CL",     piece:"CRESCENT LOVE SEAT",             height:"39",  width:"76.5", depth:"42",   seatHeight:"20",   armHeight:"22.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"171310CS",     piece:"CRESCENT SOFA",                  height:"39",  width:"103.5",depth:"44",   seatHeight:"20",   armHeight:"22.5" },
  { collection:"Corsica", style:"CUSHION",      sku:"660908C50",    piece:"CRESCENT OTTOMAN BENCH",         height:"16",  width:"49",   depth:"26",   seatHeight:"16",   armHeight:"" },
  // Corsica – WOVEN
  { collection:"Corsica", style:"WOVEN",        sku:"161537WS",     piece:"DINING CHAIR",                   height:"37",  width:"25",   depth:"29",   seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"WOVEN",        sku:"161501WS",     piece:"HIGH BACK DINING CHAIR",         height:"43",  width:"25",   depth:"27",   seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"WOVEN",        sku:"161569WS",     piece:"SWIVEL ROCKER",                  height:"37",  width:"25",   depth:"29",   seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"WOVEN",        sku:"161570WS",     piece:"HIGH BACK SWIVEL ROCKER",        height:"43",  width:"25",   depth:"27",   seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"WOVEN",        sku:"161525NTWS",   piece:"SWIVEL ACTION LOUNGER",          height:"43",  width:"28",   depth:"28",   seatHeight:"17",   armHeight:"24" },
  { collection:"Corsica", style:"WOVEN",        sku:"161517WS",     piece:"OTTOMAN",                        height:"15",  width:"27.5", depth:"21",   seatHeight:"15",   armHeight:"14.5" },
  { collection:"Corsica", style:"WOVEN",        sku:"161527WS-28",  piece:"SWIVEL BAR STOOL",               height:"48",  width:"25",   depth:"28",   seatHeight:"28",   armHeight:"34.5" },
  // Corsica – SLING
  { collection:"Corsica", style:"SLING",        sku:"161137",       piece:"DINING CHAIR",                   height:"36",  width:"25",   depth:"27.5", seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"SLING",        sku:"161101",       piece:"HIGH BACK DINING CHAIR",         height:"42.5",width:"25",   depth:"27.5", seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"SLING",        sku:"161169",       piece:"SWIVEL ROCKER",                  height:"36.5",width:"25",   depth:"29",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"SLING",        sku:"161170",       piece:"HIGH BACK SWIVEL ROCKER",        height:"42.5",width:"25",   depth:"28",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"SLING",        sku:"161125NT",     piece:"SWIVEL ACTION LOUNGER",          height:"42.5",width:"28",   depth:"28",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"SLING",        sku:"161117",       piece:"OTTOMAN",                        height:"14.5",width:"27.5", depth:"21.5", seatHeight:"14.5", armHeight:"" },
  { collection:"Corsica", style:"SLING",        sku:"161116",       piece:"DOUBLE GLIDER",                  height:"41",  width:"51.5", depth:"33",   seatHeight:"18",   armHeight:"24.5" },
  { collection:"Corsica", style:"SLING",        sku:"161127-28",    piece:"SWIVEL BAR STOOL",               height:"47",  width:"25",   depth:"29",   seatHeight:"28",   armHeight:"34.5" },
  { collection:"Corsica", style:"SLING",        sku:"161132",       piece:"CHAISE LOUNGE",                  height:"45",  width:"28.5", depth:"81",   seatHeight:"15.5", armHeight:"21.5" },
  // Corsica – PADDED SLING
  { collection:"Corsica", style:"PADDED SLING", sku:"161137PS",     piece:"DINING CHAIR",                   height:"36",  width:"25",   depth:"27.5", seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161101PS",     piece:"HIGH BACK DINING CHAIR",         height:"42.5",width:"25",   depth:"27.5", seatHeight:"17",   armHeight:"23.5" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161169PS",     piece:"SWIVEL ROCKER",                  height:"36.5",width:"25",   depth:"29",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161170PS",     piece:"HIGH BACK SWIVEL ROCKER",        height:"42.5",width:"25",   depth:"28",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161125NTPS",   piece:"SWIVEL ACTION LOUNGER",          height:"42.5",width:"28",   depth:"28",   seatHeight:"17.5", armHeight:"24" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161117PS",     piece:"OTTOMAN",                        height:"14.5",width:"27.5", depth:"21.5", seatHeight:"14.5", armHeight:"" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161116PS",     piece:"DOUBLE GLIDER",                  height:"41",  width:"51.5", depth:"33",   seatHeight:"18",   armHeight:"24.5" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161127PS-28",  piece:"BAR STOOL",                      height:"47",  width:"25",   depth:"29",   seatHeight:"28",   armHeight:"34.5" },
  { collection:"Corsica", style:"PADDED SLING", sku:"161132PS",     piece:"CHAISE LOUNGE",                  height:"45",  width:"28.5", depth:"81",   seatHeight:"15.5", armHeight:"21.5" },
  // Kenzo – CUSHION
  { collection:"Kenzo",   style:"CUSHION",      sku:"391411",       piece:"LOUNGE CHAIR",                   height:"39",  width:"30",   depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391425NT",     piece:"SWIVEL ACTION LOUNGER",           height:"39",  width:"30",   depth:"34",   seatHeight:"18",   armHeight:"23.5" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391417",       piece:"OTTOMAN",                        height:"13",  width:"30",   depth:"22",   seatHeight:"15.5", armHeight:"13" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391414",       piece:"LOVE SEAT",                      height:"39",  width:"55",   depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391421",       piece:"SOFA",                           height:"39",  width:"79.5", depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391432",       piece:"CHAISE LOUNGE",                  height:"40",  width:"30.5", depth:"79",   seatHeight:"18",   armHeight:"25" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391810CC2",    piece:"CRESCENT ARMLESS",               height:"",    width:"",     depth:"",     seatHeight:"",     armHeight:"" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391410CL",     piece:"CRESCENT LOVE SEAT",             height:"39",  width:"76.5", depth:"40",   seatHeight:"19",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"CUSHION",      sku:"391410CS",     piece:"CRESCENT SOFA",                  height:"39",  width:"100.5",depth:"44.5", seatHeight:"19",   armHeight:"22.5" },
  // Kenzo – MODULAR
  { collection:"Kenzo",   style:"MODULAR",      sku:"391610MR2",    piece:"RIGHT ARM",                      height:"",    width:"",     depth:"",     seatHeight:"",     armHeight:"" },
  { collection:"Kenzo",   style:"MODULAR",      sku:"391610MC",     piece:"ARMLESS MODULE",                 height:"39",  width:"25",   depth:"34.5", seatHeight:"18",   armHeight:"" },
  { collection:"Kenzo",   style:"MODULAR",      sku:"391610SC",     piece:"SQUARE CORNER MODULE",           height:"39",  width:"36.5", depth:"36.5", seatHeight:"18",   armHeight:"" },
  { collection:"Kenzo",   style:"MODULAR",      sku:"391610ML2",    piece:"LEFT ARM 2-SEAT MODULE",         height:"39",  width:"52.5", depth:"34.5", seatHeight:"18",   armHeight:"22.5" },
  // Kenzo – WOVEN
  { collection:"Kenzo",   style:"WOVEN",        sku:"391611WS",     piece:"LOUNGE CHAIR",                   height:"39",  width:"30",   depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"WOVEN",        sku:"391614WS",     piece:"LOVE SEAT",                      height:"39",  width:"55",   depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"WOVEN",        sku:"391621WS",     piece:"SOFA",                           height:"39",  width:"79.5", depth:"34",   seatHeight:"18",   armHeight:"22.5" },
  { collection:"Kenzo",   style:"WOVEN",        sku:"391625NTWS",   piece:"SWIVEL ACTION LOUNGER",          height:"39",  width:"30",   depth:"34",   seatHeight:"18",   armHeight:"23.5" },
  // Kenzo – SLING
  { collection:"Kenzo",   style:"SLING",        sku:"381537",       piece:"DINING CHAIR",                   height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"SLING",        sku:"381501",       piece:"HIGH BACK DINING CHAIR",         height:"42",  width:"25.5", depth:"29",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"SLING",        sku:"381569",       piece:"SWIVEL ROCKER",                  height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"SLING",        sku:"381570",       piece:"HIGH BACK SWIVEL ROCKER",        height:"42",  width:"25.5", depth:"29",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"SLING",        sku:"381525NT",     piece:"SWIVEL ACTION LOUNGER",          height:"41.5",width:"28.5", depth:"29",   seatHeight:"17",   armHeight:"23" },
  { collection:"Kenzo",   style:"SLING",        sku:"381517",       piece:"OTTOMAN",                        height:"14.5",width:"28.5", depth:"21",   seatHeight:"14.5", armHeight:"14" },
  { collection:"Kenzo",   style:"SLING",        sku:"381527-28",    piece:"SWIVEL BAR STOOL",               height:"48.5",width:"25.5", depth:"28",   seatHeight:"28",   armHeight:"34.5" },
  { collection:"Kenzo",   style:"SLING",        sku:"381532",       piece:"CHAISE LOUNGE",                  height:"46",  width:"29",   depth:"80.5", seatHeight:"15",   armHeight:"22" },
  // Kenzo – PADDED SLING (Sling base)
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381537PS",     piece:"DINING CHAIR",                   height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381501PS",     piece:"HIGH BACK DINING CHAIR",         height:"42",  width:"25.5", depth:"29",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381569PS",     piece:"SWIVEL ROCKER",                  height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381570PS",     piece:"HIGH BACK SWIVEL ROCKER",        height:"42",  width:"25.5", depth:"29",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381525NTPS",   piece:"SWIVEL ACTION LOUNGER",          height:"41.5",width:"28.5", depth:"29",   seatHeight:"17",   armHeight:"23" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381517PS",     piece:"OTTOMAN",                        height:"14.5",width:"28.5", depth:"21",   seatHeight:"14.5", armHeight:"14" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381527PS-28",  piece:"SWIVEL BAR STOOL",               height:"48.5",width:"25.5", depth:"28",   seatHeight:"28",   armHeight:"34.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381532PS",     piece:"CHAISE LOUNGE",                  height:"46",  width:"29",   depth:"80.5", seatHeight:"15",   armHeight:"22" },
  // Kenzo – PADDED SLING (Woven base)
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381537WS",     piece:"DINING CHAIR",                   height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381501WS",     piece:"HIGH BACK DINING CHAIR",         height:"42",  width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381569WS",     piece:"SWIVEL ROCKER",                  height:"35.5",width:"25.5", depth:"30",   seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381570WS",     piece:"HIGH BACK SWIVEL ROCKER",        height:"42",  width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"23.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381525NTWS",   piece:"SWIVEL ACTION LOUNGER",          height:"41.5",width:"28.5", depth:"29",   seatHeight:"17",   armHeight:"23" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381517WS",     piece:"OTTOMAN",                        height:"14.5",width:"28.5", depth:"21",   seatHeight:"14.5", armHeight:"14" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381527WS-28",  piece:"SWIVEL BAR STOOL",               height:"48.5",width:"25.5", depth:"30",   seatHeight:"28",   armHeight:"34.5" },
  { collection:"Kenzo",   style:"PADDED SLING", sku:"381532WS",     piece:"CHAISE LOUNGE",                  height:"46",  width:"29",   depth:"80.5", seatHeight:"15",   armHeight:"22" },
  // KOR – no style
  { collection:"KOR",     style:"",             sku:"901611AC",     piece:"ARM CHAIR",                      height:"32",  width:"31",   depth:"34",   seatHeight:"19",   armHeight:"21.5" },
  { collection:"KOR",     style:"",             sku:"901650",       piece:"LOUNGER",                        height:"26.5",width:"69",   depth:"45.5", seatHeight:"16.5", armHeight:"21" },
  { collection:"KOR",     style:"",             sku:"901652",       piece:"LOUNGER OTTOMAN",                height:"16.5",width:"60",   depth:"26",   seatHeight:"16.5", armHeight:"" },
  { collection:"KOR",     style:"",             sku:"901650SD",     piece:"LOUNGER W/ SHADE",               height:"58",  width:"69",   depth:"45.5", seatHeight:"16.5", armHeight:"21" },
  // KOR – MODULAR
  { collection:"KOR",     style:"MODULAR",      sku:"901610MR",     piece:"RIGHT ARM MODULE",               height:"32",  width:"28",   depth:"34",   seatHeight:"19",   armHeight:"22" },
  { collection:"KOR",     style:"MODULAR",      sku:"901610MC",     piece:"ARMLESS MODULE",                 height:"32",  width:"25.5", depth:"32.5", seatHeight:"19",   armHeight:"" },
  { collection:"KOR",     style:"MODULAR",      sku:"901610ML",     piece:"LEFT ARM MODULE",                height:"32",  width:"28",   depth:"34",   seatHeight:"19",   armHeight:"22" },
  { collection:"KOR",     style:"MODULAR",      sku:"901610CC",     piece:"CURVED CORNER MODULE",           height:"32",  width:"49",   depth:"30",   seatHeight:"19",   armHeight:"" },
  { collection:"KOR",     style:"MODULAR",      sku:"901710SC",     piece:"SQUARE CORNER MODULE",           height:"32",  width:"34",   depth:"34",   seatHeight:"19",   armHeight:"" },
  // KOR – SLING
  { collection:"KOR",     style:"SLING",        sku:"891814",       piece:"LOVE SEAT TIGHT SLING",          height:"30.5",width:"30",   depth:"29",   seatHeight:"17",   armHeight:"21" },
  { collection:"KOR",     style:"SLING",        sku:"891821",       piece:"SOFA TIGHT SLING",               height:"16.5",width:"30",   depth:"22",   seatHeight:"15",   armHeight:"16.5" },
  { collection:"KOR",     style:"SLING",        sku:"891732",       piece:"TIGHT SLING",                    height:"",    width:"",     depth:"",     seatHeight:"",     armHeight:"" },
  { collection:"KOR",     style:"SLING",        sku:"891733",       piece:"TIGHT SLING",                    height:"",    width:"",     depth:"",     seatHeight:"",     armHeight:"" },
  // KOR – PADDED SLING
  { collection:"KOR",     style:"PADDED SLING", sku:"891524PS",     piece:"DINING CHAIR",                   height:"32",  width:"29",   depth:"26.5", seatHeight:"17.5", armHeight:"21.5" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891528PS",     piece:"SIDE CHAIR",                     height:"32",  width:"25",   depth:"25.5", seatHeight:"17.5", armHeight:"" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891513PS",     piece:"SPA CHAIR",                      height:"24.5",width:"29",   depth:"26.5", seatHeight:"10",   armHeight:"15" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891820PS",     piece:"ARMLESS RECLINER",               height:"41.5",width:"29",   depth:"48.5", seatHeight:"16",   armHeight:"" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891511PS",     piece:"LOUNGE CHAIR",                   height:"30.5",width:"30",   depth:"29",   seatHeight:"17",   armHeight:"21" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891517PS",     piece:"OTTOMAN",                        height:"16.5",width:"30",   depth:"22",   seatHeight:"15",   armHeight:"16.5" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891814PS",     piece:"LOVE SEAT",                      height:"30.5",width:"53.5", depth:"29",   seatHeight:"17",   armHeight:"21" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891821PS",     piece:"SOFA",                           height:"30.5",width:"77",   depth:"29",   seatHeight:"17",   armHeight:"21" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891526PS",     piece:"BAR STOOL",                      height:"43",  width:"29",   depth:"26.5", seatHeight:"28",   armHeight:"32.5" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891529PS",     piece:"ARMLESS BAR STOOL",              height:"43",  width:"22.5", depth:"26",   seatHeight:"28",   armHeight:"" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891532PS",     piece:"CHAISE LOUNGE",                  height:"42",  width:"34",   depth:"78.5", seatHeight:"15.5", armHeight:"20" },
  { collection:"KOR",     style:"PADDED SLING", sku:"891533PS",     piece:"ARMLESS CHAISE LOUNGE",          height:"42",  width:"28.5", depth:"78.5", seatHeight:"15.5", armHeight:"" },
  // Lakeside – CUSHION
  { collection:"Lakeside",style:"CUSHION",      sku:"732325NT",     piece:"SWIVEL ACTION LOUNGER",          height:"37",  width:"33",   depth:"34",   seatHeight:"18",   armHeight:"24" },
  { collection:"Lakeside",style:"CUSHION",      sku:"731370",       piece:"HIGH BACK SWIVEL ROCKER",        height:"45",  width:"27",   depth:"32",   seatHeight:"21.5", armHeight:"25.5" },
  { collection:"Lakeside",style:"CUSHION",      sku:"732311",       piece:"LOUNGE CHAIR",                   height:"37",  width:"30",   depth:"34.5", seatHeight:"20",   armHeight:"25.5" },
  { collection:"Lakeside",style:"CUSHION",      sku:"732317",       piece:"OTTOMAN",                        height:"15.5",width:"30",   depth:"22",   seatHeight:"17",   armHeight:"15.5" },
  { collection:"Lakeside",style:"CUSHION",      sku:"732314",       piece:"LOVE SEAT",                      height:"37",  width:"55",   depth:"34.5", seatHeight:"20",   armHeight:"25.5" },
  { collection:"Lakeside",style:"CUSHION",      sku:"732321",       piece:"SOFA",                           height:"37",  width:"80",   depth:"34.5", seatHeight:"20",   armHeight:"25.5" },
  // Lakeside – SLING
  { collection:"Lakeside",style:"SLING",        sku:"740501",       piece:"HIGH BACK DINING CHAIR",         height:"41.5",width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"25" },
  { collection:"Lakeside",style:"SLING",        sku:"740570",       piece:"HIGH BACK SWIVEL ROCKER",        height:"41.5",width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"25" },
  { collection:"Lakeside",style:"SLING",        sku:"740527-28",    piece:"SWIVEL BAR STOOL",               height:"48.5",width:"25.5", depth:"28.5", seatHeight:"28",   armHeight:"35.5" },
  { collection:"Lakeside",style:"SLING",        sku:"740532",       piece:"CHAISE LOUNGE",                  height:"46.5",width:"29",   depth:"80.5", seatHeight:"15",   armHeight:"22.5" },
  // Lakeside – PADDED SLING
  { collection:"Lakeside",style:"PADDED SLING", sku:"740501PS",     piece:"HIGH BACK DINING CHAIR",         height:"41.5",width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"25" },
  { collection:"Lakeside",style:"PADDED SLING", sku:"740570PS",     piece:"HIGH BACK SWIVEL ROCKER",        height:"41.5",width:"25.5", depth:"29.5", seatHeight:"17.5", armHeight:"25" },
  { collection:"Lakeside",style:"PADDED SLING", sku:"740527PS-28",  piece:"SWIVEL BAR STOOL",               height:"48.5",width:"25.5", depth:"28.5", seatHeight:"28",   armHeight:"35.5" },
  { collection:"Lakeside",style:"PADDED SLING", sku:"741232PS",     piece:"CHAISE LOUNGE",                  height:"46.5",width:"29",   depth:"80.5", seatHeight:"15",   armHeight:"22.5" },
];

function buildSpecs(row: Row): Record<string, string> | null {
  const specs: Record<string, string> = {};
  if (row.height)      specs["Height"]      = `${row.height}"`;
  if (row.width)       specs["Width"]       = `${row.width}"`;
  if (row.depth)       specs["Depth"]       = `${row.depth}"`;
  if (row.seatHeight)  specs["Seat Height"] = `${row.seatHeight}"`;
  if (row.armHeight)   specs["Arm Height"]  = `${row.armHeight}"`;
  return Object.keys(specs).length > 0 ? specs : null;
}

async function main() {
  const MANUFACTURER_ID = 25; // Tropitone

  const rows = RAW.map((r) => {
    const collTitle = toTitle(r.collection);
    const styleTitle = r.style ? toTitle(r.style) : "";
    const pieceTitle = toTitle(r.piece);
    const name = styleTitle
      ? `${collTitle} ${styleTitle} ${pieceTitle}`
      : `${collTitle} ${pieceTitle}`;
    const slug = toSlug(`tropitone-${r.sku}`);
    const specs = buildSpecs(r);

    return {
      name,
      slug,
      sku: r.sku,
      manufacturerId: MANUFACTURER_ID,
      categoryId: null,
      quoteOnly: true,
      availableOnline: true,
      showPriceOnline: false,
      isActive: true,
      specs: specs ? sql`${JSON.stringify(specs)}::jsonb` : sql`NULL`,
    };
  });

  console.log(`Inserting ${rows.length} Tropitone products…`);

  let inserted = 0;
  let skipped = 0;
  const BATCH = 20;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      const { specs: _specs, ...rest } = row;
      try {
        await db
          .insert(productsTable)
          .values({
            ...rest,
            specs: row.specs as never,
          })
          .onConflictDoNothing({ target: productsTable.sku });
        inserted++;
      } catch (err) {
        console.error(`  ERROR inserting ${row.sku} (${row.name}):`, err);
        skipped++;
      }
    }
    console.log(`  Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} errors.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
