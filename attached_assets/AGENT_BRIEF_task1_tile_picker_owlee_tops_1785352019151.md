# Agent Brief: Tile Picker on All O.W. Lee Table Tops (Task 1 of 3)

## Scope declaration (read first)

This brief covers ONE thing: making the tile picker appear and work on all
seven O.W. Lee table top products, resolving the correct SKU. Explicitly OUT
of scope for this brief:

- NO pricing work of any kind (no variant_grade_prices rows, no msrp/sale/cost,
  no price display changes). Pricing is Task 2, later.
- NO base recommendations or base picker. That is Task 3, later.
- NO changes to any non-O.W.-Lee product, any checkout/cart/payment code
  (checkout.ts, cart.ts, adminOrderPayments.ts, lib/authorizeNet.ts), or any
  wishlist file beyond the specific touch points listed below.
- Do NOT modify adjacent picker logic (fabric, finish, finial, stem, cover,
  cushion) except where this brief explicitly says so.

## Context

O.W. Lee table tops are quote-only products (quote_only=true,
available_online=false) rendered in the "Available through a sales agent"
branch of `artifacts/web/src/pages/Product.tsx` (the `data.quoteOnly` block,
~line 1148).

The tile picker ALREADY EXISTS in code:

- `artifacts/web/src/components/ProductOptionPickers.tsx` has a `tileFinishes`
  bucket that filters the product's finishes to those whose description
  matches `/table\s*(?:top\s*)?tile|table\s*finish|HDPE\s*finish/i` and
  renders a swatch dialog for them.
- The quote-only branch already renders `ProductOptionPickers` with
  `selectedTableTopTileId={wlTileId}` / `onTableTopTileChange={setWlTileId}`
  (~line 1247) and passes `selectedTableTopTileId` into `WishlistButton`.
- `wishlists` schema already has `selected_table_top_tile_id` referencing
  `finishes`.

The reason nothing shows in the UI today: the seven O.W. Lee top products have
NO "Table Top Tile" finishes wired to them, so `tileFinishes` filters to an
empty list and the picker renders nothing. Tile swatches exist as finishes
under Materials > Finishes > OW Lee > Table Top Tiles.

The affected products (parents; each has size variants):

| Parent SKU | Series               | Valid tiles (exact set)                                          |
|------------|----------------------|------------------------------------------------------------------|
| P-TOPS     | Fresco Porcelain     | Canyon Taupe, Summit Grey, Cabaletta, Cavatina, Palazzo White, Palazzo Black |
| E-TOPS     | City Porcelain       | Urban Pulse, Urban Shift                                         |
| W-TOPS     | Reclaimed Porcelain  | Myrtle Beach, Atlantic City                                      |
| D-TOPS     | Dakota Porcelain     | Venice Beach, Buckskin, Silver Oak, Blackwood                    |
| V-TOPS     | Valencia Porcelain   | Trullo, Cielo                                                    |
| K-TOPS     | Dekton               | Dekton Soke, Dekton Trillium                                     |
| MM-TOPS    | Micro Mesh           | NONE — no tile picker on Micro Mesh, ever                        |

Source of truth for these sets: the O.W. Lee 2026 Retail Price List (tier
columns per series). Do not add any tile to any series beyond this table.

## Part A — Wire tile finishes to the six tile-bearing products

For each of the six products (NOT MM-TOPS), wire the product to its exact
tile set from the table above via the same mechanism the PDP already reads
(the product's finishes payload — `product_finish_options` rows pointing at
the tile finishes). Requirements:

1. Verify first, then insert: before inserting, query each product's existing
   finish options and skip anything already present. Paste the before/after
   row lists at the Gate 1 check-in.
2. Only tiles from the table above. Micro Mesh (the tile) must NOT be wired
   to anything. MM-TOPS (the product) gets nothing.
3. Do not touch the frame-finish rows already wired to these products. Tile
   rows are additive.
4. The tile finishes must be the existing rows in Materials > Finishes > OW
   Lee > Table Top Tiles. Do NOT create new finish rows. If a tile named in
   the table cannot be found among existing finishes, STOP and report at the
   check-in — do not create or guess.
5. Confirm each tile finish's `description` matches the ProductOptionPickers
   tile regex (`/table\s*(?:top\s*)?tile|table\s*finish|HDPE\s*finish/i`).
   If any tile finish has a description that does NOT match (and therefore
   would not bucket as a tile), report it at the check-in — do not silently
   edit descriptions.

**GATE 1: STOP. Paste the raw SQL/queries run and the before/after finish-
option rows per product. Wait for approval before Part B.**

## Part B — Dekton restructure (one variant per size, tile as a separate choice)

Dekton (K-TOPS) currently has one variant per size-AND-tile (e.g. #K-3156SU =
31x56 + umbrella hole + Soke), so its size list shows entries like
"31\" x 56\" - Soke". This must change so Dekton looks IDENTICAL to the other
tops in the UI: a size list with no tile in it, and the tile chosen in the
tile picker.

Required end state:

1. The size picker for Dekton lists sizes only (e.g. `31" x 56"`,
   `31" x 56" with Umbrella Hole`, `42" x 84"`, ...) — no tile names in the
   size list.
2. The tile picker shows the two Dekton swatches (Dekton Soke, Dekton
   Trillium).
3. The resolved/displayed SKU is the REAL per-tile vendor SKU: selecting
   size `31" x 56" with Umbrella Hole` + tile `Soke` must display `#K-3156SU`.
   The vendor SKU encodes the tile; it must never display a size-only or
   placeholder SKU once both selections are made.
4. Before both selections are made, follow the same partial-selection display
   behavior the other tops use (whatever the page does for porcelain when
   size is picked but tile is not — match it exactly).

Implementation constraint: do NOT delete or rename the existing Dekton
variant rows or their SKUs in this task. The per-tile variants (#K-24RDS,
#K-24RDT, ... #K-4284TU) are the real orderable SKUs and must remain the
rows that get resolved. Implement the size+tile → variant resolution in the
frontend/selection layer (derive the size list by grouping the existing
variants; resolve the variant from size choice + tile choice). Any DB
restructuring of Dekton variants is a separate later decision — flag at the
check-in if you believe it is required, do not do it.

**GATE 2: STOP. Paste the diff for the Dekton resolution logic and
screenshots/description of the Dekton PDP showing: size list without tiles,
tile picker with 2 swatches, and the SKU updating to the correct per-tile
SKU. Wait for approval before Part C.**

## Part C — Selection capture and staff visibility

1. Customer wishlist: saving a top with a tile selected must store
   `selected_table_top_tile_id` (mechanism already exists via WishlistButton)
   AND the human-readable snapshot must include the tile (e.g.
   "Tile: Cabaletta"), consistent with how finish/fabric snapshots render.
2. Staff wishlist views (WishlistDetail, adminWishlists list, wishlist PDF,
   outreach email): the tile line must display wherever finish/fabric lines
   already display. These surfaces were previously fixed to resolve
   finish/fabric/tile names — verify tile actually flows through on a real
   saved wishlist and fix only if broken.
3. For Dekton, the wishlist must store the resolved per-tile variant
   (`variant_id` of e.g. #K-3156SU) so every wishlist surface shows the real
   vendor SKU. This mechanism (variantId on wishlist) already exists — verify
   it receives the resolved variant, not a size-level guess.

**GATE 3: STOP. Save one porcelain top (with tile) and one Dekton top (size +
tile) to a wishlist. Paste what the customer wishlist shows and what the
staff WishlistDetail shows for both, including SKUs. Wait for approval.**

## Part D — Verification walk (definition of done)

Full manual walk, both UIs, before claiming done:

1. Each of the six tile-bearing tops shows a tile picker with EXACTLY its
   valid tile set (count them: Fresco 6, City 2, Reclaimed 2, Dakota 4,
   Valencia 2, Dekton 2), rendered as swatches with images.
2. MM-TOPS shows NO tile picker.
3. Dekton: size list has no tile names; size+tile resolves the correct
   vendor SKU; SKU display matches the manufacturer SKU exactly (including
   the `#` prefix).
4. Porcelain: SKU remains the size variant's SKU regardless of tile choice
   (tile does not alter porcelain SKUs).
5. Wishlist round-trip (customer save → staff view) shows size, finish, and
   tile for both a porcelain and a Dekton example.
6. No fabric picker appears on any of these tops (they have no fabric).
7. Typecheck and build pass. State the commands run and their output.

Green typecheck/build proves nothing about behavior — the walk above is the
acceptance test.

## Reporting rules

- At every gate: raw diffs and real command/query output. No prose summaries
  in place of output.
- If anything in this brief conflicts with what you find in the code, STOP
  and report at the next gate. Do not improvise around it.
- Be economical: no refactors, no drive-by cleanups, no renames outside the
  stated scope.
