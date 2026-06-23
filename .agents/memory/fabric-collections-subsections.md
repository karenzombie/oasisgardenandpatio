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

**Belenos & Wicker are stored as `finishes` (mfr 17), grouped by `description`,
NOT `collection`** (NorthCape finishes leave the `collection` column empty).
They are referenced by ~1344 `product_finish_options` rows. "Moving" them to the
Fabrics section is therefore NOT a pure catalog reclassification — fully moving
means re-wiring those product links to `product_fabric_options` and removing the
finishes, which is destructive. Confirm intent before doing it.
