# Agent Brief: Close the Availability-Invariant Write-Path Holes

## Goal

Make it impossible to write a product row that violates the permanent invariant:

> `available_online = NOT quote_only`  (on every product row)

`show_price_online` is independent and is NOT part of this invariant (it has a
legitimate edge case: price shown while in inquiry mode).

Today the invariant is enforced by data normalization only. Nothing in the write
paths keeps it true, so the admin forms silently reintroduce broken rows. This
brief closes every write path. Dev only. Do not sync to prod (Karen handles that).

## Background (why, in one paragraph)

The checkout and cart servers correctly gate on BOTH `available_online` and
`quote_only`, so the storefront is currently safe. The problem is upstream: the
product create form, the product edit toggle, and the bulk-update dialog can each
write a row where `available_online` and `quote_only` are not inverses. The most
recent example was product 5930 (`available_online=true, quote_only=true`), which
is exactly what the single-product inquiry toggle produces today. We are fixing the
write paths, not the gates.

## The invariant, precisely

For any product write:

- Purchasable state: `available_online=true`,  `quote_only=false`
- Inquiry state:     `available_online=false`, `quote_only=true`

`show_price_online` is set separately and is NOT derived here.

---

## Change A (primary): Server-side backstop at all three write sites

This is the change that actually guarantees the invariant. It must be applied at
ALL THREE product write sites:

1. Create handler in `artifacts/api-server/src/routes/adminProducts.ts`
   (around line 535, where the insert object sets `showPriceOnline`,
   `availableOnline`, `quoteOnly`).
2. Update handler in `artifacts/api-server/src/routes/adminProducts.ts`
   (around line 646, where the update conditionally spreads `availableOnline`
   and `quoteOnly`).
3. Bulk handler in `artifacts/api-server/src/routes/adminProductsBulk.ts`
   (around line 190, where `scalarSet.availableOnline` and `scalarSet.quoteOnly`
   are assigned).

### The rule to apply at each site, right before the DB write

Given the two flag intents present in this specific write, coerce them to be
inverses, with `quote_only` treated as authoritative:

- If `quoteOnly` is being set in this write: force `availableOnline = NOT quoteOnly`.
- Else if `availableOnline` is being set (and `quoteOnly` is not): force
  `quoteOnly = NOT availableOnline`.
- If neither is being set: do nothing (leave both untouched).
- Never derive or overwrite `showPriceOnline` in this backstop. Leave it exactly
  as the caller sent it.

Precedence note (why `quote_only` wins): the product forms express the real intent
through `quote_only`, while the bulk dialog expresses it through `available_online`
and does not send `quote_only`. Honoring `quote_only` when present, and falling
back to `available_online` when it is absent, produces the correct result for every
current caller.

A small shared helper that takes "the flags being written" and returns the coerced
pair is a reasonable way to avoid repeating the logic at three sites, but implement
it however you see fit. Do not change any request or response shape, and do not
touch the OpenAPI spec.

### Checkpoint 1

Stop after Change A. Report the diff for all three sites and confirm no api-spec
file changed. Do not proceed to Change B until confirmed.

---

## Change B: Fix the single-product inquiry toggle

File: `artifacts/web/src/staff/pages/admin/ProductEdit.tsx`

In the "Available online" `FlagRow` (its `onChange` currently reads):

```
onChange={(v) =>
  setForm((f) => ({
    ...f,
    availableOnline: true,
    quoteOnly: !v,
    showPriceOnline: v,
  }))
}
```

Change the single line `availableOnline: true,` to `availableOnline: v,`.

That is the only change in this file. After it, toggling the product to inquiry
mode (`v=false`) sets `availableOnline=false, quote_only=true, show_price_online=false`,
and toggling it on sets `availableOnline=true, quote_only=false, show_price_online=true`.
Do not change the separate "Show price in inquiry mode" toggle; it correctly sets
`show_price_online` on its own for the edge case.

---

## Change C: Fix the bulk-update dialog

File: `artifacts/web/src/staff/components/BulkUpdateProductsDialog.tsx`

In `buildPayload()`, the block that currently reads:

```
if (availableOnline !== "none")
  fields.availableOnline = availableOnline === "true";
```

Change it so that when the operator sets Available Online in the bulk dialog, the
payload also carries the derived companions, following the locked rule that price
is hidden by default whenever a product is not available online:

```
if (availableOnline !== "none") {
  const avail = availableOnline === "true";
  fields.availableOnline = avail;
  fields.quoteOnly = !avail;
  fields.showPriceOnline = avail;
}
```

`fields.quoteOnly` and `fields.showPriceOnline` already exist on the request type
(`AdminBulkUpdateProductsFields`) and are already honored by the bulk server
handler, so no api-spec or codegen change is required. Do not add new UI controls
to the dialog.

### Checkpoint 2

Stop after Changes B and C. Report both diffs. Do not proceed to verification
until confirmed.

---

## Verification (Change/Phase 3)

Run and paste output for each:

1. Codegen drift check (must show NO changes, since no spec change was intended):
   ```
   pnpm --filter ./lib/api-spec run codegen && git status --short
   ```
   Paste the actual output. A clean (empty) result for generated files is the pass
   condition. Do not report success from a green typecheck alone.

2. Manual write tests in dev admin, checking the actual DB row after each save:
   - Single form: toggle a purchasable product to inquiry, save. Expect the row to
     become `available_online=false, quote_only=true, show_price_online=false`.
   - Single form: toggle it back to available. Expect
     `available_online=true, quote_only=false, show_price_online=true`.
   - Bulk dialog: select a few products, set Available Online = off. Expect every
     touched row to be `available_online=false, quote_only=true, show_price_online=false`.
   - Bulk dialog: set Available Online = on. Expect
     `available_online=true, quote_only=false, show_price_online=true`.
   - Create a new NON-umbrella product with defaults, save. Expect the row to be
     coherent (`available_online=false, quote_only=true`), NOT the old broken
     `available_online=true, quote_only=true`.

### Checkpoint 3

Report the verification output. Stop.

---

## What NOT to touch

- Do not change the cart or checkout guards. They are already correct and are the
  safety net; leave them.
- Do not derive or force `show_price_online` on the server backstop. It is
  independent by design.
- Do not modify the OpenAPI spec or run any spec edit. All required fields already
  exist.
- Do not change `catalog_visible`, `is_active`, or any unrelated flag logic.
- Do not add new admin UI controls.
