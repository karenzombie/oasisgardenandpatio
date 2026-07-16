export const GALTECH_POLE_PRODUCT_IDS = [4966, 4967] as const;

export const GALTECH_POLE_INFO: Record<number, { poleSku: string; poleName: string }> = {
  4966: { poleSku: "BP", poleName: "Bottom Pole" },
  4967: { poleSku: "BH", poleName: "Bar Height Pole" },
};

export interface GaltechPoleFinish {
  code: string;
  name: string;
  swatchImageUrl: string;
}

export const GALTECH_POLE_FINISHES: Record<string, GaltechPoleFinish> = {
  AB: { code: "AB", name: "Antique Bronze", swatchImageUrl: "/api/storage/objects/finishes/galtech/antique-bronze.jpg" },
  AP: { code: "AP", name: "Antique Pewter", swatchImageUrl: "/api/storage/objects/finishes/galtech/antique-pewter.jpg" },
  BK: { code: "BK", name: "Black", swatchImageUrl: "/api/storage/objects/finishes/galtech/black.jpg" },
  CH: { code: "CH", name: "Charcoal", swatchImageUrl: "/api/storage/objects/finishes/galtech/charcoal.jpg" },
  DC: { code: "DC", name: "Deluxe Champagne", swatchImageUrl: "/api/storage/objects/finishes/galtech/deluxe-champagne.jpg" },
  DW: { code: "DW", name: "Dark Wood", swatchImageUrl: "/api/storage/objects/finishes/galtech/dark-wood.jpg" },
  LT: { code: "LT", name: "Latte", swatchImageUrl: "/api/storage/objects/finishes/galtech/latte.jpg" },
  LW: { code: "LW", name: "Light Wood", swatchImageUrl: "/api/storage/objects/finishes/galtech/light-wood.jpg" },
  MB: { code: "MB", name: "Bronze", swatchImageUrl: "/api/storage/objects/finishes/galtech/bronze.jpg" },
  RC: { code: "RC", name: "Rib Champagne", swatchImageUrl: "/api/storage/objects/finishes/galtech/rib-champagne.jpg" },
  SR: { code: "SR", name: "Silver", swatchImageUrl: "/api/storage/objects/finishes/galtech/silver.jpg" },
  TK: { code: "TK", name: "Teak", swatchImageUrl: "/api/storage/objects/finishes/galtech/teak.jpg" },
  W:  { code: "W",  name: "White", swatchImageUrl: "/api/storage/objects/finishes/galtech/white.jpg" },
};

export type GaltechPoleMaterial = "ALUMINUM" | "WOOD" | "TEAK";

export interface GaltechPoleModel {
  sku: string;
  name: string;
  material: GaltechPoleMaterial;
  finishCodes: string[];
}

export const GALTECH_POLE_MODELS: GaltechPoleModel[] = [
  { sku: "636",   name: "Manual Tilt Umbrella 9'",                         material: "ALUMINUM", finishCodes: ["MB"] },
  { sku: "715",   name: "Commercial Use Umbrella 6'",                       material: "ALUMINUM", finishCodes: ["AB"] },
  { sku: "722",   name: "Deluxe Commercial Use 7.5'",                       material: "ALUMINUM", finishCodes: ["AB","BK","SR"] },
  { sku: "725",   name: "Commercial Use 7.5'",                              material: "ALUMINUM", finishCodes: ["AB","BK","W"] },
  { sku: "727",   name: "Deluxe Auto Tilt 7.5'",                            material: "ALUMINUM", finishCodes: ["AB","AP","BK","DC","LT","RC","SR","W"] },
  { sku: "732",   name: "Deluxe Commercial Use Umbrella 9'",                material: "ALUMINUM", finishCodes: ["AB","BK","SR"] },
  { sku: "735",   name: "Commercial Use Umbrella 9'",                       material: "ALUMINUM", finishCodes: ["AB","BK","W"] },
  { sku: "736",   name: "Standard Auto Tilt Umbrella 9'",                   material: "ALUMINUM", finishCodes: ["BK","CH","MB","W"] },
  { sku: "737",   name: "Deluxe Auto Tilt Umbrella 9'",                     material: "ALUMINUM", finishCodes: ["AB","AP","BK","DC","LT","RC","SR","W"] },
  { sku: "762",   name: "Deluxe Commercial Use Square Umbrella 6'x6'",      material: "ALUMINUM", finishCodes: ["AB","SR"] },
  { sku: "772",   name: "Half Wall 3.5x7'",                                 material: "ALUMINUM", finishCodes: ["AB"] },
  { sku: "779",   name: "Deluxe Auto Tilt Oval Umbrella 8'x11'",            material: "ALUMINUM", finishCodes: ["AB","BK"] },
  { sku: "781",   name: "Deluxe Commercial Use Flat Profile Umbrella 11'",  material: "ALUMINUM", finishCodes: ["SR"] },
  { sku: "782",   name: "Deluxe Commercial Use Square Umbrella 8'x8'",      material: "ALUMINUM", finishCodes: ["SR"] },
  { sku: "789",   name: "Deluxe Auto Tilt Umbrella 11'",                    material: "ALUMINUM", finishCodes: ["AB","BK"] },
  { sku: "791",   name: "Deluxe Commercial Use Umbrella 13'",               material: "ALUMINUM", finishCodes: ["SR"] },
  { sku: "792",   name: "Deluxe Commercial Use Umbrella 10'x10'",           material: "ALUMINUM", finishCodes: ["SR"] },
  { sku: "799",   name: "Deluxe Auto Tilt Umbrella 10'x10'",                material: "ALUMINUM", finishCodes: ["AB","BK"] },
  { sku: "936",   name: "Auto Tilt with LED Lights Umbrella 9'",            material: "ALUMINUM", finishCodes: ["AB","BK"] },
  { sku: "986",   name: "Auto Tilt with LED Lights Umbrella 11'",           material: "ALUMINUM", finishCodes: ["AB","BK"] },
  { sku: "121",   name: "Cafe Wood 7.5'",                                   material: "WOOD",     finishCodes: ["DW","LW"] },
  { sku: "131",   name: "All Purpose Wood Umbrella 9'",                     material: "WOOD",     finishCodes: ["LW"] },
  { sku: "132",   name: "Double Pulley Wood Umbrella 9'",                   material: "WOOD",     finishCodes: ["DW","LW"] },
  { sku: "136",   name: "Commercial Wood Umbrella 9'",                      material: "WOOD",     finishCodes: ["LW"] },
  { sku: "183",   name: "Quad Pulley Wood Umbrella 11'",                    material: "WOOD",     finishCodes: ["LW"] },
  { sku: "532TK", name: "Designer Teak Umbrella 9'",                        material: "TEAK",     finishCodes: ["TK"] },
  { sku: "537TK", name: "Rotational Tilt Teak Umbrella 9'",                 material: "TEAK",     finishCodes: ["TK"] },
  { sku: "587TK", name: "Crank Lift Teak Umbrella 11'",                     material: "TEAK",     finishCodes: ["TK"] },
];

export function composedPoleSku(poleSku: string, modelSku: string, finishCode: string): string {
  return `${poleSku}-${modelSku}-${finishCode}`;
}
