# Agent Brief: Frankford Product Care Tab

## Objective

On the product page, set the Care tab content for Frankford Umbrellas products by product type: umbrella-fabric care for umbrellas, base care for umbrella bases, and no Care tab at all for everything else Frankford. No other manufacturer changes.

This is a frontend-only change. No database changes, no data migration.

## Where the Care content lives today

The Care tab is not data-driven. Its content is hardcoded in `artifacts/web/src/pages/Product.tsx`. Today it has two paths only: if the manufacturer is O.W. Lee it shows a PDF, otherwise it shows a generic "Brush off loose dirt" bullet list. There is no care field on the product. This brief adds Frankford-specific handling alongside the existing O.W. Lee path.

## Classification rule (three buckets)

All buckets apply ONLY when `manufacturerSlug === "frankford-umbrellas"`. For every other manufacturer, behavior is unchanged.

1. Fabric Care: product is in the Umbrellas category.
2. Base Care: product is in the Umbrella Bases category, EXCEPT the 8 accessory products listed below.
3. No Care tab (tab hidden entirely): every other Frankford product (replacement parts, chaise, tables, and the 8 excluded accessories).

### The 8 base accessories to EXCLUDE from Base Care (they get no Care tab)

Exclude by product id (ids are exact and immutable). SKU shown for reference only.

- id 5090, sku `+W`, Castor Locking Wheels (Set of 4)
- id 5617, sku `24G-TC`, Round Aluminum Top Cover
- id 5618, sku `30G-TC`, Round Aluminum Top Cover
- id 5619, sku `36G-TC`, Round Aluminum Top Cover
- id 5620, sku `40G-TC`, Round Aluminum Top Cover
- id 5621, sku `20G-SQ-TC`, Square Aluminum Top Cover
- id 5622, sku `24G-SQ-TC`, Square Aluminum Top Cover
- id 5623, sku `36G-SQ-TC`, Square Aluminum Top Cover

## The full surface this change touches (all inside Product.tsx)

1. `visibleTabs` (currently hides the Features tab when there is no features content). It must also hide the Care tab when the product falls in bucket 3.
2. `activeTab` fallback (the line that reselects the first visible tab when the current tab is not visible). This ALREADY handles a hidden Care tab correctly. Do not add redundant logic. Just confirm it still holds after the change.
3. The Care render block (the `activeTab === "care"` section). Add the Fabric Care and Base Care branches alongside the existing O.W. Lee branch, ahead of the generic fallback.

Confirmed there are no other consumers: the tab is only set by clicking a visible tab, there is no URL sync, no analytics, and no deep-linking to the Care tab anywhere in the web app.

## Recon first. Gate 1. STOP after this.

Confirm and report the following from the live code and database, then STOP for review before writing any code:

1. The exact `categorySlug` value the product detail payload returns for the Umbrellas category (category name "Umbrellas") and for the Umbrella Bases category (category name "Umbrella Bases"). These two slug strings will be the classification keys.
2. That the product detail payload exposes `manufacturerSlug`, `categorySlug`, `id`, and `sku` on the product object used by Product.tsx.
3. That all 8 excluded ids above resolve to Frankford products in the Umbrella Bases category, so the exclusion is hitting the right rows.
4. The exact current shape of `visibleTabs`, the `activeTab` fallback, and the `activeTab === "care"` render block, pasted as they exist now.

Report real output. Do not proceed to implementation until approved.

## Implementation. Gate 2. Only after Gate 1 is approved.

1. Add a single derivation that computes the Frankford care kind for the current product, one of: fabric, base, none, or not-applicable.
   - not-applicable when `manufacturerSlug !== "frankford-umbrellas"`.
   - fabric when Frankford and `categorySlug` is the Umbrellas slug.
   - base when Frankford and `categorySlug` is the Umbrella Bases slug and the product id is NOT one of the 8 excluded ids.
   - none for any other Frankford product.
2. Extend `visibleTabs` so the Care tab is hidden only when the care kind is none. Leave the Features rule as-is. Add the care kind to the memo dependencies.
3. In the Care render block, keep the O.W. Lee branch first, then add: fabric kind renders the Fabric Care copy below, base kind renders the Base Care copy below. Every other case falls through to the existing generic fallback exactly as it does today.
4. Render both copy blocks inside the same wrapper the generic block uses (`prose max-w-none text-foreground/80`) so styling matches. Render the ALL-CAPS lines and the titled sections as bold subheadings, paragraphs as paragraphs, and the dashed items below as a normal bulleted list. Do not alter any wording.

## The exact copy to render

Render verbatim. The only permitted formatting choice is that the dashed items become a normal bulleted list. Do not change wording, punctuation, symbols, or order.

### Base Care copy (Base Care bucket)

**Umbrella Base Care**

Do not let dirt build up on the bases. Bases should be cleaned with mild soap and water. Seasonal touch-up of any scratches, chips, occasional rust seepage from crevices or hidden or unfinished surfaces inherent in some designs is all that is required. Never leave bases standing in water. To keep your bases looking their best, you may wish to store them when not in use for an extended period of time.

DISCLAIMER: Finishes will vary slightly depending on the final process and raw materials on which it is applied.

**STEEL BASE/MOUNTS PREVENTIVE MAINTENANCE**

DISCLAIMER: Ferrous metals are naturally in the air and can adhere and etch into any surface. These small particles can rust on the surface giving an unsightly look. To combat this, periodically hose powder coated steel bases, steel umbrella stems and steel mounts with warm fresh water and a mild detergent. This should be a part of a weekly routine to ensure the longevity of all steel products.

**POWDER COATED STEEL STEM AND BASE**

Upon receiving your powder coated steel base, and/or mount, apply a rust inhibitor to the inside of the steel stem. The stems are powder coated steel, however, the inside of the stem lacks total coverage, exposing the raw steel and accelerating natural deterioration.

PRO TIP: Before setting up your base, rinse with clean fresh water, towel dry or air dry, and apply WD-40 SPECIALIST LONG TERM CORROSION INHIBITOR to the entirety of the base. Repeat this twice a year to ensure the longevity of your base.

**VISUAL RUST**

If you notice rust stains, rinse the steel product with warm water and a mild detergent to determine it's origin. Once the damaged area has been discovered, scrub off the visible rust using warm water, white vinegar and a stainless steel wire brush (steel wire brushes will leave further iron deposits on the surface).

Once rust (orange oxidation) is visibly gone, apply a thin coat of RUST-OLEUM® STOPS RUST® RUST INHIBITOR SPRAY to the affected area. Then apply the closest matching RUST-OLEUM® paint available at your local hardware store.

Rusty water stains may appear from rusting ferrous metal deposits on the surface, not the actual product. The most common place this would occur is from the umbrella stem/threads. Remove the stem, clean with warm fresh water, white vinegar and a soft sponge or brush.

Dry off with a towel, and then apply WD-40 SPECIALIST LONG TERM CORROSION INHIBITOR to the threads of the umbrella stem and female receiving cup of the stem.

### Fabric Care copy (Fabric Care bucket)

**Fabric Care**

Recacril® 9 oz. awning-grade acrylic fabric is treated with the Infinity Process: A highly technological finish, providing REcacril® with long-lasting protection against mold and mildew, excellent water and oil repellency, and protection from the sun. However, the accumulation of dust, pollution particles, foreign organic materials, and general dirt can damage this protection, shortening the life of the Recacril®.

To preserve the look of your umbrella, they should be removed. The most effective method for maintaining REcacril® is to clean the canvas once a month with water using a low-pressure hose. It is very important that after cleaning with water, the canvas be allowed to completely dry before rolling or storing your umbrella. If for any reason you have to roll and/or store a wet umbrella, it must be unrolled and opened as soon as possible to dry. In times of continuous rain, it is advisable to keep the umbrella rolled and stored.

If periodic washing with water is done, in most environments, you should only need to do a more thorough cleaning every 2-3 years.

**FABRIC CRAZING/MARBLING**

Crazing is an inherent characteristic of all solution-dyed acrylic fabrics and is caused by folding or creasing of the fabric during production or installation.

- Crazing lines appear as white lines on dark-colored fabrics when front-lit, and dark lines on light-colored fabrics when backlit. The primary contributors to crazing are the resins added in the final stages of manufacturing. These resins add stiffness so the fabric lies flat during sewing, which is critical for the manufacturing process.
- These resins can be viewed as an industrial fabric starch with a specific end purpose. Crazing DOES NOT affect the performance or characteristics of Recasens®, Sunbrella®, Outdura®, or other acrylic fabrics. The fabric remains water repellent as well as stain and mildew resistant, and the lines will diminish over time with exposure to the elements.

**Intensive Care & Cleaning**

Recacril® is highly resistant to the growth of fungus, mold, and mildew. However, these can grow on embedded dirt. To clean these stains, follow these more intensive cleaning procedures.

- Brush off dust and dirt with a soft brush. NEVER brush with stiff brushes as this can damage the fabric finish.
- Prepare a solution with 10% household bleach, 20% solvent-free neutral detergent (Free & Clear detergents) and 70% water.
- Apply the solution to the fabric, letting it remain between 15 and 20 minutes maximum.
- Rinse with clean water several times. Any bleach residues remaining on the canvas, combined with the sun, could damage the fabric and stitching.
- Let air dry and do not close the umbrella until the canvas is completely dry.

**Casual Care & Cleaning**

Regular cleaning and care sets up your umbrella for lasting success. Here are some tips for general upkeep of your shade.

- Brush off dust and dirt with a soft brush. NEVER brush with stiff brushes since this can damage the fabric finish.
- Spray the umbrella with clean water. If a hose is used, avoid high pressure.
- Prepare a solution of solvent-free soap in warm water (no more than 100°F) and apply it to the fabric and stitching.
- Scrub with a soft brush, allowing the solution to penetrate the fabric.
- Rinse with water to remove all traces of soap.
- Let air dry and do not close the umbrella until the canvas is completely dry.

## Do NOT touch (guardrails)

- Do not change the care behavior for any non-Frankford manufacturer. The O.W. Lee PDF branch and the generic fallback must stay exactly as they are for everyone except Frankford.
- Do not change any product categorization, and do not touch the database. This is a frontend rendering change only.
- Do not change the `activeTab` fallback logic. It already reselects a visible tab when the Care tab is hidden. Confirm it, do not modify it.
- Do not change the Features, Specifications, or Warranty tabs.
- Do not add analytics, URL params, or deep-linking for the Care tab.

## Verification

- Run the project typecheck and confirm it passes.
- Karen performs the UI walkthrough. The agent cannot screenshot or self-verify UI. Do not claim UI verification.

Karen's dev checks:
1. A Frankford umbrella (for example The Aurora Aluminum) shows the Care tab with the Fabric Care copy.
2. A Frankford base (for example 40G) shows the Care tab with the Base Care copy.
3. A Frankford replacement part (for example any RIB or Protective Cover) shows no Care tab at all.
4. One of the 8 excluded accessories (for example 40G-TC or +W) shows no Care tab at all.
5. A Frankford chaise or table shows no Care tab at all.
6. An O.W. Lee product still shows the O.W. Lee PDF in the Care tab.
7. A non-Frankford, non-O.W. Lee product still shows the generic care bullet list.

## Stop protocol

Dev only. Do not run any prod operation and do not sync anything to prod. Stop at Gate 1 with the recon output. After Gate 2, stop and report the diff for review. Do not perform the UI walkthrough.
