export const TG_REPLACEMENT_PARTS_PRODUCT_ID = 6334;

export interface TgFinish {
  code: string;
  name: string;
}

export interface TgFrameModel {
  modelCode: string;
  modelName: string;
  stub: string;
  finishes: TgFinish[];
}

export interface TgPoleEntry {
  stub: string;
  height: string;
  modelCodes: string[];
  finishes: TgFinish[];
}

export const TG_FRAME_MODELS: TgFrameModel[] = [
  { modelCode: "AKZP13LX", modelName: "STARLUX AKZ PLUS 13'", stub: "AKZP13LX-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "AKZPRTLX", modelName: "STARLUX AKZ PLUS 10'x13'", stub: "AKZPRTLX-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "AKZP13", modelName: "AKZ PLUS 13'", stub: "AKZP13-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { modelCode: "AKZPRT", modelName: "AKZ PLUS 10'x13'", stub: "AKZPRT-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { modelCode: "AKZPSQ11", modelName: "AKZ PLUS 11.5'", stub: "AKZPSQ11-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "AKZP", modelName: "AKZ PLUS 11'", stub: "AKZP-_", finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { modelCode: "AG25TR", modelName: "AG25T 11.5'", stub: "AG25TR-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "AG25TSQR", modelName: "AG25TSQ 10'", stub: "AG25TSQR-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "AG25TR10", modelName: "AG25T 10'", stub: "AG25TR10-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "ET3RT", modelName: "EASY TRACK® 10'x13'", stub: "ET3RT-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "ET310", modelName: "Easy Track®", stub: "ET310-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "USA45", modelName: "SHANGHAI COLLAR TILT 10'", stub: "USA45-_", finishes: [{ code: "09", name: "Black" }] },
  { modelCode: "UM851", modelName: "TWIST 11'", stub: "UM851-_", finishes: [{ code: "02", name: "Anthracite" }, { code: "03", name: "White" }] },
  { modelCode: "UM850", modelName: "TWIST 9'", stub: "UM850-_", finishes: [{ code: "02", name: "Anthracite" }, { code: "03", name: "White" }] },
  { modelCode: "UM800LX", modelName: "STARLUX COLLAR TILT 9'", stub: "UM800LX-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM801", modelName: "COLLAR TILT 11'", stub: "UM801-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM800", modelName: "COLLAR TILT 9'", stub: "UM800-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM841", modelName: "FLEX 11'", stub: "UM841-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM840", modelName: "FLEX 9'", stub: "UM840-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM847SQ", modelName: "Flex 7.5' Square", stub: "UM847SQ-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM812", modelName: "AUTO TILT 11'", stub: "UM812-_", finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { modelCode: "UM810", modelName: "AUTO TILT 9'", stub: "UM810-_", finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { modelCode: "UM8810RT", modelName: "AUTO TILT 8'x10'", stub: "UM8810RT-_", finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { modelCode: "UM970", modelName: "GLIDE TILT 9'", stub: "UM970-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM977", modelName: "GLIDE TILT 7.5'", stub: "UM977-_", finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { modelCode: "UM920", modelName: "PUSH BUTTON TILT 9'", stub: "UM920-_", finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { modelCode: "UM907", modelName: "PUSH BUTTON TILT 7.5'", stub: "UM907-_", finishes: [{ code: "00", name: "Bronze" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { modelCode: "UM809", modelName: "QUAD PULLEY LIFT 9'", stub: "UM809-_", finishes: [{ code: "1H", name: "Hardwood" }] },
];

export const TG_POLE_ENTRIES: TgPoleEntry[] = [
  { stub: "BP54-ET3-0_", height: '54"', modelCodes: ["ET3RT", "ET310"], finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP32-800_", height: '32"', modelCodes: ["USA45", "UM800"], finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { stub: "BP45-800_", height: '45"', modelCodes: ["USA45", "UM800", "UM801"], finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { stub: "BP36-801_", height: '36"', modelCodes: ["USA45", "UM800", "UM801"], finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP37-850_", height: '37"', modelCodes: ["UM851", "UM850"], finishes: [{ code: "02", name: "Anthracite" }, { code: "03", name: "White" }] },
  { stub: "BP45-850_", height: '45"', modelCodes: ["UM851"], finishes: [{ code: "02", name: "Anthracite" }, { code: "03", name: "White" }] },
  { stub: "BP32-800_LXR", height: '32"', modelCodes: ["UM800LX"], finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP45-800_LXR", height: '45"', modelCodes: ["UM800LX"], finishes: [{ code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP32-810_", height: '32"', modelCodes: ["UM810", "UM8810RT", "UM970"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { stub: "BP36-812_", height: '36"', modelCodes: ["UM812", "UM810", "UM8810RT", "UM970", "UM977"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { stub: "BP45-810_", height: '45"', modelCodes: ["UM812", "UM810", "UM8810RT", "UM970", "UM977"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "WO", name: "Weathered Oak" }, { code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { stub: "BP32-840_", height: '32"', modelCodes: ["UM841"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP36-840_", height: '36"', modelCodes: ["UM841", "UM840", "UM847SQ"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP45-840_", height: '45"', modelCodes: ["UM841", "UM840", "UM847SQ"], finishes: [{ code: "SS", name: "Silver Shadow" }, { code: "00", name: "Bronze" }, { code: "09", name: "Black" }] },
  { stub: "BP32-920_", height: '32"', modelCodes: ["UM920"], finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { stub: "BP36-907_", height: '36"', modelCodes: ["UM920", "UM907"], finishes: [{ code: "00", name: "Bronze" }, { code: "03", name: "White" }, { code: "09", name: "Black" }] },
  { stub: "BP45-920_", height: '45"', modelCodes: ["UM920", "UM907"], finishes: [{ code: "00", name: "Bronze" }, { code: "02", name: "Anthracite" }, { code: "09", name: "Black" }] },
  { stub: "BP36-8091", height: '36"', modelCodes: ["UM809-1H"], finishes: [{ code: "1H", name: "Hardwood" }] },
];

export const TG_POLE_MODEL_NAMES: Record<string, string> = {
  "ET3RT": "EASY TRACK® 10'x13'",
  "ET310": "Easy Track®",
  "USA45": "SHANGHAI COLLAR TILT 10'",
  "UM800": "COLLAR TILT 9'",
  "UM801": "COLLAR TILT 11'",
  "UM851": "TWIST 11'",
  "UM850": "TWIST 9'",
  "UM800LX": "STARLUX COLLAR TILT 9'",
  "UM810": "AUTO TILT 9'",
  "UM8810RT": "AUTO TILT 8'x10'",
  "UM970": "GLIDE TILT 9'",
  "UM812": "AUTO TILT 11'",
  "UM977": "GLIDE TILT 7.5'",
  "UM841": "FLEX 11'",
  "UM840": "FLEX 9'",
  "UM847SQ": "Flex 7.5' Square",
  "UM920": "PUSH BUTTON TILT 9'",
  "UM907": "PUSH BUTTON TILT 7.5'",
  "UM809-1H": "QUAD PULLEY LIFT 9'",
};

export function composeTgFrameSku(stub: string, finishCode: string): string {
  return `FRAME-ONLY ${stub.replace("_", finishCode)}`;
}

export function composeTgPoleSku(stub: string, finishCode: string): string {
  return stub.includes("_") ? stub.replace("_", finishCode) : stub;
}

export function tgPoleHeightsForModel(modelCode: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of TG_POLE_ENTRIES) {
    if (entry.modelCodes.includes(modelCode) && !seen.has(entry.height)) {
      seen.add(entry.height);
      out.push(entry.height);
    }
  }
  return out;
}

export function tgPoleEntryFor(
  modelCode: string,
  height: string,
): TgPoleEntry | undefined {
  return TG_POLE_ENTRIES.find(
    (e) => e.modelCodes.includes(modelCode) && e.height === height,
  );
}

export const TG_POLE_MODELS: { code: string; name: string }[] = (() => {
  const seen = new Set<string>();
  const out: { code: string; name: string }[] = [];
  for (const entry of TG_POLE_ENTRIES) {
    for (const code of entry.modelCodes) {
      if (!seen.has(code)) {
        seen.add(code);
        const name = TG_POLE_MODEL_NAMES[code];
        if (name) out.push({ code, name });
      }
    }
  }
  return out;
})();
