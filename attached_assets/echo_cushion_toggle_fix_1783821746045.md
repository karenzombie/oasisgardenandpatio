# Echo Cushion Toggle Fix

## Problem
The cushion toggle on the PDP is currently working for the original Echo single products but not for the 2-pack products we just added. This is likely because the toggle logic is hard-coded to specific product IDs or SKUs rather than being data-driven.

## What we need
The cushion toggle logic must be data-driven. The rule is simple:

- If a product has a `cushion_upgrade_sku` value set, show the No Cushion / Cushion toggle
- When the customer selects Cushion, look up the product with that SKU, load its fabric pool, and update the displayed SKU
- When the customer selects No Cushion, hide the fabric picker and revert to the base SKU

This should work automatically for any product in the database that has `cushion_upgrade_sku` set -- no product IDs or SKUs should be hard-coded anywhere in the toggle logic.

## Please check in before making any changes
Investigate the current implementation first and tell me how it is currently determining which products get the cushion toggle. Then check in before changing anything.
