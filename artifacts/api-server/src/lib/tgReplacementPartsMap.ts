export const TG_REPLACEMENT_PARTS_PRODUCT_ID = 6334;

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

export function resolveTgPoleVariantName(
  variantName: string,
  selectedModelCode: string | null | undefined,
): string {
  if (!variantName.includes("[MODEL]") || !selectedModelCode) return variantName;
  const modelName = TG_POLE_MODEL_NAMES[selectedModelCode] ?? selectedModelCode;
  return variantName.replace("[MODEL]", modelName);
}
