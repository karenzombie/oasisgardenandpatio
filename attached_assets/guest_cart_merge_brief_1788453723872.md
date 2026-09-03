# BRIEF: Fix Guest Cart Merge On Sign-In

**Type:** New brief. Unrelated to the guest checkout and guest account messaging
work, all of which is complete and shipped.
**Scope:** One function in one backend file. No frontend, no OpenAPI spec, no
codegen, no schema migration.
**Approach:** Deliberately incremental. Five stages, each with a hard stop. Do
not run ahead.

---

## Symptom

A guest adds items to their cart, then signs in or creates an account. Their
cart is empty. The items are gone.

---

## Diagnosis

Confirmed by reading the code and the schema, not inferred from behavior.

`mergeGuestCartIntoUserCart` in `artifacts/api-server/src/routes/auth.ts` has
four defects. The first is why it fails today. The rest are why a naive fix
would replace silent loss with silent corruption.

### Defect 1: the upsert conflict target does not match any unique index

The merge's raw SQL declares a conflict target of four columns:
cart id, product id, coalesced variant id, coalesced fabric id.

The real unique index on `cart_items`, defined in `lib/db/src/schema/cart.ts`
as `cart_items_cart_product_variant_fabric_unique`, is **seven** columns. It
also includes coalesced `finish_id`, coalesced `finial_id`, and
`addon_signature`.

Postgres rejects an `ON CONFLICT` target that does not match a real unique
index. The statement throws every time it runs.

### Defect 2: the failure is swallowed

The whole function is wrapped in a try/catch that logs a warning and returns.
Sign-in succeeds, the cart quietly does not merge, and nothing surfaces. That
is why this looked intermittent rather than broken.

### Defect 3: it only fails on one of the two paths

If the signed-in user has **no** existing cart, a different branch simply
re-keys the guest cart by setting its user id and clearing its session id.
That path works correctly and must not be disturbed.

The broken path is the other one: when the user **already has** a cart, the
copy-and-upsert runs, throws, and the guest cart is abandoned.

### Defect 4: the copy is missing five columns and an entire table

The insert copies only product id, variant id, fabric id, quantity and price.

`cart_items` also carries `finish_id`, `finial_id`, `addon_signature`,
`selected_model_code` and `parent_cart_item_id`. None are copied.

Separately, add-ons live in their own table, `cart_item_addons`, keyed by
`cart_item_id`. Those rows are not copied at all.

So fixing only the conflict target would stop the error and start silently
corrupting lines instead. A Frankford line would lose its frame finish. A
Treasure Garden replacement part would lose its model code. Add-ons would
vanish. `addon_signature` defaults to empty string, so two lines that differ
only by their add-on set would collapse into one.

---

## Two structural problems the fix has to solve

These are the reason this is staged rather than done in one pass.

### Self-referencing parent lines

`parent_cart_item_id` points at another row in the same table. It is used for
the galvanized-base aluminum top cover: the cover line points at its base line,
and the cover is deleted and quantity-locked with its parent.

Copying rows into a new cart gives them new ids. A parent id copied verbatim
would point at a row in the old cart, which is then deleted. You must map old
ids to new ids and rewrite the parent reference. Inserting parents before
children is not optional.

### Add-on rows and quantity accumulation

`cart_item_addons` is keyed by `cart_item_id`, so it needs the same id
remapping, and it has its own unique constraint on
`(cart_item_id, addon_option_id)`.

There is also a semantic question the current code sidesteps. On conflict, the
existing behavior accumulates quantity. Two lines with the same seven-column
signature have the same `addon_signature`, so their add-on sets match by
definition and the existing add-on rows stay correct as-is. **Preserve the
accumulate-quantity behavior. Do not change it.** Just make sure you do not
also duplicate add-on rows onto the surviving line.

### Not atomic

The merge is several statements with no transaction. A failure midway can leave
the guest cart partly copied and partly deleted. The whole merge should run in
one transaction so it either completes or leaves everything untouched.

---

## Reference implementation already in the codebase

Do not invent a new upsert. `POST /cart/items` in
`artifacts/api-server/src/routes/cart.ts` (roughly lines 1103 to 1157) already
does correctly, today, most of what this merge needs:

- the exact seven-column `ON CONFLICT` target, written out in full
- the whole add plus its add-on rows wrapped in a single `db.transaction`
- `RETURNING id` on the line insert, then the `cart_item_addons` insert using
  that id with `onConflictDoNothing`
- the parent and child pattern for the galvanized base and its aluminum top
  cover, including the cover row carrying `parent_cart_item_id`

Copy the conflict target from there verbatim rather than retyping it, and follow
the same transaction and add-on shape. If anything in that route contradicts
this brief, stop and say so.

---

## Stages

Each stage ends with a hard stop. Report, wait for confirmation, then continue.
Do not combine stages. Do not run ahead. If a stage reveals something that
contradicts this brief, stop and say so rather than adapting on your own.

### Stage 1: Prove the diagnosis. Change no behavior.

Do not fix anything yet.

Add temporary diagnostic logging inside the existing catch so the actual thrown
error is captured in full, rather than the current summary warning. Then
reproduce the failure in dev:

1. As a guest, add an item to the cart.
2. Sign in as a user who **already has** a non-empty cart.
3. Capture the exact Postgres error text.

Report the verbatim error. It should name the `ON CONFLICT` specification not
matching a unique or exclusion constraint. **If it says something else, stop.**
The rest of this brief assumes Defect 1 and would need revisiting.

**STOP. Paste the exact error. Wait for confirmation.**

### Stage 2: Correct the conflict target and the scalar copy

Still no add-ons, still no parent lines.

- Change the conflict target to match the real seven-column unique index
  exactly, including the coalesced null handling on variant, finish, fabric and
  finial, and `addon_signature`. Copy it from the reference route above.
- Extend the copy to carry every scalar column the table has:
  `finish_id`, `finial_id`, `addon_signature`, `selected_model_code`, in
  addition to the five already copied.
- Replace the single set-based `INSERT ... SELECT` with a read of the guest
  lines (all columns, including each line's id) followed by a loop that copies
  one line at a time, each insert using `RETURNING id`. This is required by
  Stage 3: a bulk `INSERT ... SELECT` returns the new ids but gives you no way
  to tell which guest line each one came from. Same shape as the reference
  route. Cart sizes are small, so the extra round trips do not matter.
- Leave `parent_cart_item_id` null for now. Stage 4 handles it.
- Wrap the whole merge in a transaction.
- Keep the accumulate-quantity behavior on conflict.
- Keep the no-existing-user-cart re-key path exactly as it is.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 3: Add-ons

- Build the mapping from each guest cart item id to the id of the row it became
  in the user cart, using the `RETURNING id` from the per-line loop added in
  Stage 2. `ON CONFLICT ... DO UPDATE ... RETURNING id` returns the surviving
  row's id, so the mapping covers the inserted and the conflict-updated case
  the same way. Do not try to reconstruct this by re-matching rows on the key
  columns afterward.
- Copy `cart_item_addons` rows across using that mapping, carrying
  `addon_option_id`, `unit_price` and `quantity`.
- The unique constraint `cart_item_addons_item_option_unique` on
  `(cart_item_id, addon_option_id)` is what prevents duplicates. Insert with
  `onConflictDoNothing` and let the constraint do the work. Do not write
  additional logic to detect the accumulated case. Where a line already existed
  in the user cart, its existing add-on rows win, which is correct: two lines
  sharing an `addon_signature` have the same add-on set by definition.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 4: Parent and child accessory lines

- Insert parent lines before their children.
- Rewrite each copied child's `parent_cart_item_id` to the new id of its parent,
  using the same mapping from Stage 3.
- On the conflict-updated path, leave the existing row's `parent_cart_item_id`
  alone. Do not overwrite it from the guest row. The surviving line already
  points at its own parent in the user cart, and that pairing is correct.
- No copied row may end up pointing at a row in the old guest cart.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 5: Error handling

- Sign-in and sign-up must still succeed even if the merge fails. That
  behavior stays. Never block authentication on a cart merge.
- Raise the swallowed failure from a warning to an error-level log, with enough
  detail to diagnose without a reproduction.
- Remove the temporary diagnostic logging added in Stage 1.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

---

## Do NOT touch

- The three call sites of the merge. Each already captures the pre-regenerate
  session id before regenerating and then merges. That sequencing is correct.
  **Do not reorder or "simplify" it.**
- Session regeneration on sign-in and sign-up.
- Any authentication logic: the local email and password paths, the Clerk sync
  path, or the early return when a Clerk user is already bound to the current
  session.
- The re-key branch used when the signed-in user has no existing cart.
- The `carts` single-open-cart-per-user unique index, or any other schema. No
  migrations.
- The frontend. No file in `artifacts/web` changes in this brief.
- The OpenAPI spec, `lib/api-zod`, `lib/api-client-react`. No codegen.
- Checkout, payment, and everything shipped in the guest checkout and guest
  account messaging work.
- The wishlist. Separate work, separate brief.

---

## Testing

Karen runs all UI verification. Do not run browser testing.

**Nothing here ships to production before Stage 4 is complete.** Stages 2 and 3
deliberately leave `parent_cart_item_id` null on copied lines, which turns an
aluminum top cover into a loose line that can be edited and deleted on its own.
That is expected mid-build and is only corrected in Stage 4.

The checks below are grouped by the earliest stage at which they can pass. Do
not ask for a check before its stage is done.

After Stage 2:

1. Signing in when the account has **no** existing cart. Items carry over.
2. Signing in when the account **already has** a cart. Both sets are present.
3. The same item configuration in both carts. One line, quantities added.
4. A Frankford item with a frame finish. The finish survives.

After Stage 3:

5. An item with add-ons. The add-ons survive and the price is right.

After Stage 4:

6. A galvanized base with its aluminum top cover. Both lines survive, stay
   paired, and the cover is still quantity-locked to its base.

After Stage 5:

7. Creating a new account rather than signing in. Same results.
8. The banner links on the checkout page: click Sign in and Create an account
   with a full cart, and confirm the cart is intact on return.
9. Checkout still works end to end afterward, as guest and signed in.

Item 8 is the customer-facing reason this work exists.
