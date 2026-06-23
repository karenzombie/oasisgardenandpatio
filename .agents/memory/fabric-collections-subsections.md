---
name: Fabric collection subsections
description: How the public Fabrics page renders sub-groups within a manufacturer, and NorthCape's no-SKU / finish-vs-fabric quirks.
---

# Fabric collection subsections

`fabrics.collection` (nullable text) drives sub-grouping on the public Fabrics
page (Materials › Fabrics › <Manufacturer> › <Collection>), mirroring how
finishes group. The web page sub-groups only when at least one fabric in a
manufacturer has a non-null `collection`; otherwise it renders the legacy flat
grid (ungrouped fabrics fall into an "Other" bucket rendered last).

**Why optional, not required:** `CatalogFabricOption` is reused by the admin
product picker producer. A new field on it must stay OPTIONAL in openapi or those
endpoints 500 at `.parse()`. Only the `/catalog/fabrics` route populates
`collection`.

**NorthCape fabrics have no vendor SKUs** — the fabric *name* doubles as
`item_number` (the `(manufacturer_id, item_number)` natural key). Same fallback
pattern as Telescope finishes. Risk: editing a name later can break the natural
key / create duplicates.

**Belenos & Wicker were MOVED from `finishes` to `fabrics`** (mfr 17,
collection='Belenos'/'Wicker'). The move re-wired all 1344 `product_finish_options`
links to `product_fabric_options` (1:1, displayOrder preserved) and deleted the 20
finishes. Their swatches stayed as static `/finish-swatches/northcape/...` public
paths (NOT object storage) — those resolve fine on the web origin and pass
toPublicImageUrl untouched. No NorthCape product mixed Belenos+Wicker (single-pick),
so the single `cart_items.fabric_id` model is preserved; cart `requiresFabric`
(active fabric options exist) now drives the requirement, and non-grade products
reject any finishId. Untouched: 33 NorthCape products that have other finishes
(Hixon/Oceanview/Fire Table/etc.) — only Belenos/Wicker were moved.

**Why the move was safe:** verify before any similar finish→fabric move that ALL
linked products belong to the one manufacturer and there are ZERO live
cart/order/wishlist references to the finish ids (ON DELETE SET NULL would null
historical orders otherwise). NorthCape products use neither variants nor grade
pricing, so there was no pricing impact.
