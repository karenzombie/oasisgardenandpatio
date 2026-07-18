# Follow-up: Complete the hands-on UI walkthrough for Item 1

The code change is in and the typecheck is green. That is not the finish line. A
green typecheck proves the code compiles, not that the screen behaves. You skipped
the browser walkthrough last time because the cart was empty. That is the step we
need now. Do not change any code. This is verification only.

## Goal
Reach the checkout address step in the dev browser with a populated cart, and
eyeball all three states with your own eyes. Confirm what actually renders, not
what the code implies.

## Steps
1. Get a product into the cart so checkout is reachable. Use the normal storefront
   add-to-cart flow in the browser if you can. If you populate the cart another
   way, say exactly how, because a cart created outside the normal flow may not
   drive checkout the same way.
2. Reach the checkout page and get to the address section.
3. Walk each of the three states and capture what renders:
   - (a) Guest (not signed in): confirm the inline address form shows.
   - (b) Signed-in customer with zero saved addresses: confirm the inline address
     form shows.
   - (c) Signed-in customer with one or more saved addresses: confirm only the
     saved-address radio list shows, that the "Use a new address" option is gone,
     and that there is no inline form. Watch specifically for any brief flash of
     the inline form on load before the default-select effect runs. Report whether
     you see a flash or not.

## What to report back
- For each of (a), (b), (c): what actually rendered, from the browser, not from
  reading the code.
- How you populated the cart, and whether it was the normal storefront flow.
- A screenshot of state (c) if you can capture one, since that is the state the
  change affects.
- If you cannot reach one of the three states in the browser, say "I could not
  determine this in the browser" and say why. Do not fall back to a code-only
  argument and call it verified.

## Do NOT
- Do not change any code.
- Do not fix anything else you notice. Report it and wait.
