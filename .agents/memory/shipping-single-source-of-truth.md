---
name: Shipping single source of truth
description: How shipping is computed across online vs staff orders, and why settings-driven shipping was removed.
---

# Shipping model

The admin **Shipping** page (Sales nav) is the single source of truth for shipping on **external customer ONLINE orders only**. The engine lives in `artifacts/api-server/src/lib/shippingRules.ts` (`loadShippingConfig` + `computeShippingForLines`), consumed by `cart.ts` and `checkout.ts`.

**Rule stacking (online only):**
- Scopes A–D (site-wide, category[+optional free-text sub_category], manufacturer, specific products) all SUM per line item.
- Scope E (by-weight tiers, fixed bounds 0-50/51-100/101-200/201-500/501+) adds ONCE per order on total order weight.
- Flat = rate × qty. Percentage = rate% × (unitPrice × qty).

**Invariants:**
- Shipping is NEVER taxed (`computeTax` taxes merchandise subtotal only).
- `shipToStore = true` ⇒ $0 shipping.

**Staff / in-store orders (walk-in / quick / restock):** DEFAULT to $0 shipping. `adminOrdersPricing.ts` (`/admin/orders/quote-pricing`) always returns `deliveryAmount = 0`. Staff may enter a MANUAL flat amount in the order builder (`NewOrder.tsx` deliveryMode auto/manual). The rules engine is NOT applied to staff orders.

**Why:** the old settings-driven shipping (shipping_mode / flat_shipping_rate / shipping_percentage / free_shipping_threshold / shipping_tiers in `system_settings`) was a parallel, conflicting source of truth. It was fully removed — `checkoutPricing.ts` is now tax-only (`loadPricingSettings` loads only `defaultTaxRate`; `computeShipping` and all shipping helpers deleted). When touching shipping, never reintroduce settings-driven shipping; extend `shippingRules.ts`.

**How to apply:** any change to online shipping goes through `shippingRules.ts`. Removing a `SETTING_KEYS` entry requires updating the OpenAPI `SystemSettings`/`SystemSettingsUpdate` schemas + codegen, `adminSettings.ts` KEY_MAP, `seedSettings.ts` DEFAULTS, and `Settings.tsx` together or typecheck/runtime breaks.
