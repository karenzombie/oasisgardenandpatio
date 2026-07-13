# AGENT BRIEF: Product Display Rank Group

## Goal

Add a coarse "rank group" tier to products so the client can control which products lead a listing
page, without maintaining a per-product integer across 3,600+ rows.

Group 1 sorts before group 2, before group 3. **Order within a group does not matter.** Ungrouped
(NULL) sorts last.

The problem: on brand pages and category listings, junk (castor wheels, mount kits, stems,
replacement parts) currently outranks the products the client wants seen.

---

## STOP. Read these seven rules first.

1. **Never run `drizzle-kit push`.** The database contains backup tables that are not in the
   Drizzle schema (`flag_fix_backup_*`, `display_order_backup_*`). A push will offer to drop them.
   Apply schema changes with hand-written SQL, then update the Drizzle schema file separately so
   types and codegen stay in sync.

2. **Never touch `products.display_order`.** It was just deliberately zeroed across all 3,612 rows.
   It stays in the sort chain as an inert tiebreaker. Leave the column, the value, and every
   existing reference to it exactly as they are.

3. **Never touch `product_images.display_order` or `product_materials.display_order`.** Different
   columns, different tables. `product_images.display_order` orders the PDP gallery and is load
   bearing.

4. **Never touch `sub_category`.** It is wired to the shipping rule sub-category picker
   (`adminShipping.ts:478-486`). Changing it can silently detach shipping rules.

5. **Rank group affects the DEFAULT sort branch ONLY.** If a customer picks "Price: Low to High"
   they get strictly price, with no merchandising thumb on the scale. This is the single most
   important rule in this brief.

6. **Never auto-hide `catalog_visible = false` products from the admin list.** They get a badge.
   The client wants to see them and skip them manually.

7. **Work the four phases in order and STOP after each one.** Each phase ends with a checkpoint a
   human verifies before the next phase begins. Do not run ahead.

---

## Files you will touch

| Phase | File | What |
|---|---|---|
| A | (hand-written SQL) | `ALTER TABLE` + index |
| A | `lib/db/src/schema/products.ts` | mirror column + partial index |
| B | `lib/api-spec/openapi.yaml` | 3 contract changes, then codegen once |
| B | `artifacts/api-server/src/routes/adminProducts.ts` | select, create, update, sort, filter |
| B | `artifacts/api-server/src/routes/adminProductsBulk.ts` | bulk scalar field |
| B | `artifacts/web/src/staff/pages/admin/ProductEdit.tsx` | rank group select |
| B | `artifacts/web/src/staff/pages/admin/Products.tsx` | Rank column, filter, Hidden badge |
| B | `artifacts/web/src/staff/components/BulkUpdateProductsDialog.tsx` | rank group + Clear |
| C | `artifacts/api-server/src/routes/products.ts` | one sort branch, four lines |
| D | `artifacts/web/src/pages/ManufacturerProducts.tsx` | default sort + sort dropdown |
| D | `artifacts/web/src/pages/Shop.tsx`, `Search.tsx` | extract shared SORTS constant |

Run typecheck and build at the end of every phase. A phase is not done if the build is red.

---

# PHASE A: Schema only

## A1. Add the column with hand-written SQL

```sql
ALTER TABLE products ADD COLUMN rank_group integer;

CREATE INDEX idx_products_rank_group
  ON products (rank_group)
  WHERE rank_group IS NOT NULL;
```

Nullable. **No default. No CHECK constraint.** NULL means "not ranked" and must sort last.

Leaving it unconstrained means a future group 4 is a frontend change only, with no migration.

## A2. Mirror it into the Drizzle schema

`lib/db/src/schema/products.ts`:

- Add `rankGroup: integer("rank_group"),` to the `productsTable` column list, near `displayOrder`
  (line 121).
- Add the partial index to the index block, matching the pattern already at lines 144-152:

```ts
index("idx_products_rank_group")
  .on(t.rankGroup)
  .where(sql`${t.rankGroup} IS NOT NULL`),
```

## A3. Wire nothing

No route changes. No UI changes. No sort changes. Not yet.

## Definition of done

- `SELECT COUNT(*) FROM products WHERE rank_group IS NOT NULL;` returns **0**.
- The index exists.
- Typecheck and build green.

## CP2 (STOP)

Human verifies: **the site is completely unchanged.** Storefront, admin, brand pages, category
pages all behave exactly as before.

**Undo:** `DROP INDEX idx_products_rank_group; ALTER TABLE products DROP COLUMN rank_group;` and
revert the schema file.

---

# PHASE B: Admin only

The client must be able to set and audit rank groups before any customer sees an effect. **Nothing
in this phase changes the storefront.**

## B1. API contract, all three changes at once

Make all three edits to `lib/api-spec/openapi.yaml`, **then run codegen once.** Doing them
piecemeal means running codegen three times and missing one.

**Change 1: extend the `sortBy` enum** (line 2053).

This one is easy to miss and fails loudly. The enum is validated upstream, so adding a `case` in
the route without adding it here means the request is rejected before it ever reaches the sort
switch, and the new column header silently 400s.

```yaml
enum: [name, sku, manufacturer, category, price, onHand, rankGroup]
```

**Change 2: add a `rankGroup` query param** to the admin product list, next to `featured`
(around line 2028).

It must be a **string, not an integer.** "Ungrouped" means `IS NULL`, which an integer param
cannot express.

```yaml
- name: rankGroup
  in: query
  required: false
  schema:
    type: string
    enum: ["1", "2", "3", "none"]
```

`"none"` means ungrouped.

**Change 3: add `rankGroup` to `AdminBulkUpdateProductsFields`** (line 11432), as a nullable
integer.

Also add `rankGroup` to the admin product read and write schemas so it round-trips through the
detail and list payloads.

## B2. API route: `adminProducts.ts`

- **Select:** add `rankGroup` to the list select (near `displayOrder`, line 249) and the detail
  serializer (near line 145).
- **Create:** `rankGroup: parsed.data.rankGroup ?? null` (mirror line 530).
- **Update:** use the conditional-spread passthrough already at lines 656-657, so an omitted field
  is left alone and an explicit `null` clears it.
- **Sort:** add a case to the `sortBy` switch (lines 377-393):

```ts
case "rankGroup":
  return productsTable.rankGroup;
```

  **Leave the `default:` branch of that switch alone.** The admin fallback stays
  `[asc(displayOrder), asc(name)]`.

- **Filter:** read the new param and push a condition alongside the existing `isActive` and
  `featured` conditions (around line 370):

```ts
if (rankGroup === "none") {
  conditions.push(isNull(productsTable.rankGroup));
} else if (rankGroup != null) {
  conditions.push(eq(productsTable.rankGroup, Number(rankGroup)));
}
```

  Import `isNull` from drizzle-orm if this file does not already import it.

## B3. Product edit form: `ProductEdit.tsx`

Add a **Rank group** control. A **select, not a number input.** A free number box invites the
client to type 47 and re-invent the unmaintainable per-product ranking this feature exists to
replace.

| Stored | Label |
|---|---|
| `null` | None |
| `1` | Group 1 (leads) |
| `2` | Group 2 |
| `3` | Group 3 |

**The sentinel matters.** Form state is a string, the column is an integer. Follow the
`umbrellaShape` pattern already in this file, which does exactly this dance:

- state init (line 210): `rankGroup: "none"`
- hydrate (line 548): `rankGroup: d.rankGroup == null ? "none" : String(d.rankGroup)`
- serialize (line 739): `rankGroup: form.rankGroup === "none" ? null : Number(form.rankGroup)`

Place it **near the Featured toggle, not in the umbrella section.** It applies to every product.

Helper text under the control:

> Products in a lower group appear first on listing pages. Order within a group is not controlled.
> Ungrouped products appear last.

## B4. Admin list: `Products.tsx`

- Add a **Rank** column, sortable via the new `sortBy=rankGroup`.
- Add a **rank group filter** with these states: **Any / 1 / 2 / 3 / Ungrouped**, wired to the new
  query param. Ungrouped is the state the client will use most, because it answers "what have I not
  gotten to yet?" Do not omit it.

Note: sorting by rank group descending puts NULLs first in Postgres. That is fine for an admin
tool. Ascending, the useful direction, puts them last.

## B5. Flags badge for hidden products: `Products.tsx`

The Flags cell is at lines 359-374. `catalogVisible` is **already sent to this page**
(`adminProducts.ts:160` and `:244`, and it is already in the generated row type). The page simply
does not render it. **Pure frontend change. No API work needed.**

```tsx
{!row.catalogVisible && (
  <Badge variant="outline" className="text-xs text-slate-500">Hidden</Badge>
)}
```

`Offline` and `Hidden` mean different things and can both appear on one row. **Do not merge them.**

- `Offline` (`available_online = false`) = cannot be purchased online.
- `Hidden` (`catalog_visible = false`) = does not appear in listings at all.

## B6. Bulk update modal: `BulkUpdateProductsDialog.tsx`

Use the **existing `FkChoice` pattern** in this file (type line 35, state line 81, serialization
lines 159-160, render lines 340-344). Three states:

- `"none"` = **No change** (the default, same as every other field in this modal)
- `"clear"` = **(Clear rank group)**, sends `null`
- `"1"`, `"2"`, `"3"`

**The Clear option is required.** The client will make mistakes and needs to undo them in bulk.

Then in `adminProductsBulk.ts`, add `rankGroup` to the scalar field set feeding
`update(productsTable).set(scalarSet)` at line 233.

## Definition of done

- Set group 1 on a product in the edit form. Reload. It persists.
- Sort the admin list by Rank. It works, no 400.
- Filter the admin list to Ungrouped. It returns products where `rank_group IS NULL`.
- Bulk-set group 2 on three products, then bulk-Clear them. Both work.
- A `catalog_visible = false` product shows a **Hidden** badge and is **still listed**.
- Typecheck and build green.

## CP3 (STOP)

Human verifies all of the above, **and that the storefront is still completely unchanged.** Rank
groups now exist in the data but have zero effect on any customer-facing page.

---

# PHASE C: The storefront sort chain

This is the whole feature. It is four lines.

## C1. The catalog chokepoint: `products.ts`

The `orderBy` switch at lines 262-280 is a single chokepoint serving Shop, Search, brand pages,
category pages, and Materials. It is the **only** place that changes.

Change **only** the `case "featured": default:` branch:

```ts
case "featured":
default:
  return [
    desc(productsTable.featured),
    asc(productsTable.rankGroup),      // NEW
    asc(productsTable.displayOrder),
    asc(productsTable.name),
  ];
```

Postgres `ASC` places NULLs last by default, which is the behavior we want (ungrouped sorts after
group 3). **Verify this in the generated SQL rather than assuming it.** If the generated query does
anything else, use an explicit `sql` fragment with `asc nulls last`.

**Do not touch `price_asc`, `price_desc`, `name_asc`, or `newest`.** See rule 5.

## C2. Leave the homepage carousel alone

`products.ts:93-97` (the featured carousel) also reads `display_order`. **Do not add `rank_group`
to it.** It is already hand-curated via `featured_at` and is out of scope.

## Definition of done

- On a category page with default sort, grouped products lead.
- On the same page sorted by price, order is **strictly by price**.

## CP4 (STOP)

Human verifies:
- The grouped products from CP3 now **lead** their category page on the default sort.
- Switching that page to **"Price: Low to High" gives strictly price order**, with the grouped
  products in their true price position and no special treatment. **This is the check that matters
  most. If it fails, stop and report rather than working around it.**
- Nothing else on the site changed.

**Undo:** revert the four lines.

---

# PHASE D: Brand pages

Brand pages **hardcode `sort: "name_asc"`** (`ManufacturerProducts.tsx:68`) and have **no sort
dropdown at all.** That is why castor wheels lead the Frankford page. They already call the same
catalog endpoint as Shop, so this is frontend only.

## D1. Stop hardcoding the sort

Read `sort` from the query string, defaulting to `"featured"`, so brand pages pick up the Phase C
chain. This page already has an `updateSearch` helper (around line 55) identical to Shop's.

## D2. Add a sort dropdown, for parity with Shop

Reuse Shop's (`Shop.tsx`, `SORTS` constant lines 22-28, dropdown render lines 441-475).

`SORTS` is currently **duplicated** in `Shop.tsx` and `Search.tsx`. Extract it to one shared module
and import it in all three pages rather than making a third copy.

**Shop and Search behavior must not change.** This is a pure extraction. If either page's sort
options or defaults shift, you have made a mistake.

## Definition of done

- The Frankford brand page **leads with grouped items, not castor wheels.**
- The brand page has a sort dropdown matching Shop's.
- Shop and Search behave identically to before.

## CP5

Human verifies the above.

---

# Out of scope. Do not do any of these.

- Any change to `umbrella_size`, `umbrella_shape`, or `umbrella_type`. A separate canopy size
  filter is being designed and will use a junction table. Leave all three columns alone.
- Any change to `sub_category`.
- Any change to the empty categories (46, 55, 56, 57, 58, 59).
- Any material activation.
- Any change to `product_recommendations`.
- Dropping or modifying any `flag_fix_backup_*` or `display_order_backup_*` table.
- Any backfill of rank group values. The client sets those himself.
