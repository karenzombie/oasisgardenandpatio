/**
 * Treasure Garden umbrella variants encode the wind-vent acronym in the variant
 * SKU (`{base}-{code}-{SWV|DWV}`) so the PDP can offer a Wind Vent selector. The
 * vent is NOT part of the orderable/PO SKU, however — the vendor identifies the
 * item by base + frame finish only and reads the vent from the line description.
 *
 * `stripVentSuffix` removes a trailing `-SWV` / `-DWV` so order-line and PO SKU
 * snapshots store `{base}-{code}`. Variant NAME snapshots intentionally keep the
 * "(SWV)/(DWV)" text so the vent still prints on the PO.
 */
export function stripVentSuffix<T extends string | null | undefined>(sku: T): T {
  if (!sku || typeof sku !== "string") return sku;
  return sku.replace(/-(SWV|DWV)$/i, "") as T;
}
