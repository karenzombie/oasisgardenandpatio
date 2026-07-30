# Replit Agent Brief: "Frame Only" for grade-priced products

## Goal

Add a working "Frame Only" option to grade-priced products, priced from its own record that carries MSRP, sale price, and cost, and offered alongside the fabric-grade choices. Build this and confirm it works BEFORE any Arc pricing data is loaded.

## Sequencing (why this is first)

Loading grade prices onto a product automatically flips it into "grade mode." Under the current code, Frame Only is switched OFF the moment a product is in grade mode. So if we load Arc's grade prices before this feature exists, Frame Only silently disappears from those products. This feature has to land first, then the Arc price data gets loaded in a separate step.

## Current behavior (confirmed in the code, not assumed)

Frame Only today works exactly one way: a single product-level price field (`products.frame_only_price`), used as one flat price with no MSRP/sale/cost breakdown. Both the public product page and the staff order screen compute support for it as "not in grade mode AND the product has fabrics AND that field is set." A product enters grade mode automatically whenever any of its variants has grade-price rows. The net effect: grade-priced products cannot offer Frame Only at all right now.

One helpful fact: no product in the catalog currently uses that legacy Frame Only price field. So there are no live products relying on the old behavior that could break.

## What to build (behavior, not code)

Design the implementation however fits the codebase best. The required behavior:

1. A grade-priced product can offer a Frame Only option that appears in the same selection area as the fabric grades, presented as its own distinct choice. Frame Only is not a fabric and must never be shown or picked as one.
2. Frame Only carries its own three prices: MSRP, sale price, and cost. Cost stays staff-only. Staff screens show all three. The option is priced from its own record, never derived from a fabric grade.
3. Picking Frame Only means no fabric is selected, and the line is priced at the Frame Only price. Picking a fabric grade instead prices from that grade, exactly as it does today.
4. These products are wishlist / quote only (not online purchase). So the Frame Only choice must work through the staff order/quote screen and the wishlist, and be recorded correctly on those lines. It must be unambiguous on the saved record, and on any vendor paperwork, that the line is Frame Only with no fabric.
5. Staff must be able to enter and edit a product's Frame Only MSRP, sale, and cost in the same place they manage that product's grade prices.

## Intended data model (this is the decision, not a suggestion)

Store the Frame Only price as its own priced record for the variant, using the same per-grade price mechanism that already holds the fabric-grade prices (a record tied to a variant, with a grade label, plus msrp, sale price, and cost). That grade label is normally matched against real fabric grades, and Frame Only is not a fabric, so you must choose a clear, reserved way to mark the Frame Only record so that: it is never treated as a selectable fabric, no real fabric grade ever collides with it, and the pricing and display paths recognize it as the Frame Only option.

Coordination requirement: document the exact reserved label or marker you use for the Frame Only record, and report it back. The Arc price load that follows this task has to write Frame Only records using that identical value, so it cannot be left implicit.

## Full footprint this change touches (cover all of it, not just the picker)

The current Frame Only and grade-pricing behavior is spread across several places. The new Frame-Only-in-grade-mode behavior has to be consistent across all of them. At minimum, trace and address:

- The public product page: the grade/fabric selector and the price display, which currently hides Frame Only in grade mode.
- The staff order/quote entry screen: how Frame Only is offered, defaulted, selected, and priced. This is a primary surface, since Arc is wishlist/quote.
- The wishlist add flow and the wishlist line record, including the human-readable snapshot of what was selected (needs to be able to say "Frame Only").
- The cart/order pricing and the order line record. Order lines today snapshot the chosen fabric's grade, brand, name, and item number. A Frame Only line has no fabric, so decide how the line is represented and priced so it is clearly Frame Only.
- The "starting price" / "from" price computation. Today it deliberately excludes Frame Only in grade mode. Decide how, if at all, Frame Only should affect the starting price shown for a grade-priced product, and make it deliberate.
- Admin editing: the grade-price editor where staff enter per-grade prices (where the Frame Only price should also be entered/edited), and reconcile the existing product-level Frame Only field.
- The bulk price-update tool, which references the Frame Only price field.
- Vendor order / purchase order output, so a Frame Only line reads clearly as frame only, no fabric to pull.
- The API contract and any generated client types: if the product payload changes shape, keep the contract consistent and regenerate.

## Must not break

- Existing grade-priced products (Frankford) and their fabric-grade pricing and display.
- The legacy product-level Frame Only field/path: either keep it working for any future non-grade product, or fold it cleanly into the new approach. Do not leave a half-removed mechanism behind.
- The API contract and generated clients stay in sync with any payload change.

## Out of scope

The Arc prices themselves. No pricing data is loaded in this task. This task is the feature only. The Arc price map and its load are a separate step that happens after this is built and after you have reported the reserved Frame Only marker value.

## Verification and handback

Build the logic and self-verify it. Karen does the UI testing and on-screen checks, since the agent cannot capture screenshots or exercise the interface. When done, hand back to Karen for UI verification and include the exact reserved Frame Only marker value you chose, so the Arc load can be built against it.
