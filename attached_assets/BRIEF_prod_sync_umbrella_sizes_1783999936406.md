# Brief: Add product_umbrella_sizes to the prod sync, and create the table in prod

## Background

The canopy size filter is built and verified on dev: `product_umbrella_sizes` exists, holds 114
rows across 80 products, and the storefront facet works on all four umbrella manufacturers.

**Prod has none of it.** No table, no rows, old code.

`scripts/deploy-sync.sh` runs automatically on every deploy and syncs the dev catalog to prod.
A grep across its four scripts shows `product_umbrella_sizes` appears **nowhere**:

```
scripts/src/dumpDevDataForProd.ts:31:  "product_materials",
scripts/src/dumpDevDataForProd.ts:85:  product_materials: ["product_id", "material_id"],
scripts/src/applyDataToProd.ts:68:  UNION ALL SELECT 'product_materials', COUNT(*)::int, NULL FROM product_materials
```

So today, deploying would push code that queries a table prod does not have. The umbrella pages
would break on the live site.

`product_umbrella_sizes` is modeled directly on `product_materials`. Same two-column junction
shape, same composite PK, same EXISTS filter pattern. **Wherever `product_materials` is handled
in the sync, `product_umbrella_sizes` needs the same handling.**

---

## Task 1: Report on the two cleanup scripts BEFORE changing anything

The grep returned **no hits at all** in `cleanupProdOnlyRows.ts` or
`cleanupProdOnlyJunctionRows.ts`, not even for `product_materials`. These are the two scripts
whose first action is deleting prod rows, and I cannot see how they choose their tables.

Before you edit anything, answer:

1. How does each of those two scripts decide which tables to operate on? Hardcoded list,
   introspection, shared constant, something else? Quote the actual code.
2. Given a **brand new junction table that exists in dev but not in prod**, what does each one do?
   Skip it, throw, or something worse?
3. Does either one need `product_umbrella_sizes` added, or do they pick it up automatically?

Answer these first. Do not guess. If a script derives its list dynamically, say so and show how.

---

## Task 2: Add the table to the sync

Add `product_umbrella_sizes` everywhere `product_materials` is handled in:

- `scripts/src/dumpDevDataForProd.ts` (both the table list and the column map:
  `product_umbrella_sizes: ["product_id", "size_label"]`)
- `scripts/src/applyDataToProd.ts` (including the row-count verification UNION)
- the two cleanup scripts, **only if Task 1 shows they need it**

Follow the existing `product_materials` pattern exactly. Do not invent a new mechanism.

### Position in the table list matters

`product_umbrella_sizes` has a foreign key to `products`. If the apply step writes junction rows
before the parent products exist, the FK rejects them and the sync fails.

`product_materials` carries the identical dependency. So do not just add the new table
*somewhere* in the list. **Add it adjacent to `product_materials`**, so it inherits the same
position relative to `products` in whatever ordering the apply step relies on. If that ordering
is significant, say so explicitly in your report.

---

## Task 3: Create the table in PROD, empty

Against `PROD_DATABASE_URL`:

```sql
CREATE TABLE product_umbrella_sizes (
  product_id  integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_label  text    NOT NULL,
  PRIMARY KEY (product_id, size_label)
);

CREATE INDEX idx_product_umbrella_sizes_size_label
  ON product_umbrella_sizes (size_label);
```

**Empty. Do not populate it.** The deploy sync will carry the 114 rows over from dev. That is the
whole point of adding it to the sync scripts.

**Use direct SQL. Do not run `drizzle-kit push` against prod.** Push will offer to drop tables it
does not recognize, and prod contains backup tables it does not know about
(`display_order_prod_backup_*`). If any tool proposes a destructive action against prod, abort
and report exactly what it proposed.

---

## Out of scope: do not touch the postbuild hook

`artifacts/api-server/package.json` contains:

```
"postbuild": "[ \"$REPLIT_DEPLOYMENT\" = '1' ] && bash ../../scripts/deploy-sync.sh || true"
```

The trailing `|| true` means a failing sync still produces a green deploy. This is a known issue
and it is **deliberately out of scope for this task.** Do not fix it, do not remove the `|| true`,
do not change how postbuild reports failure.

Changing it would turn a silent failure into a hard deploy failure, and that is a decision with
launch-timing consequences that is not yours or mine to make in passing. Leave it exactly as it
is. If you think it is wrong, say so in your report and stop there.

---

## Why this order matters

Table in prod **before** code in prod. The new code queries `product_umbrella_sizes`. If the code
lands first, prod's storefront asks for a table that does not exist and the umbrella pages error
out for real customers. Creating the table early is invisible to customers, because nothing reads
it until the code deploys.

---

## Verification

Report the actual observed result of each. Do not self-certify.

1. Your answers to Task 1, with quoted code.
2. `product_umbrella_sizes` exists in **prod**, with the composite PK, the index, and the FK with
   `ON DELETE CASCADE`. Verify with Python and psycopg2 against `PROD_DATABASE_URL` by querying
   `information_schema` and `pg_indexes`. **Do not assume `psql` is available.** Paste the output.
3. `SELECT count(*) FROM product_umbrella_sizes` in prod returns **0**.
4. Dev still has **114** rows and is untouched.
5. `products` row count in prod is still **3612**. Confirm nothing else moved.
6. The prod backup tables (`display_order_prod_backup_*`) still exist.
7. Show the diff of every sync script you changed.
8. Confirm `artifacts/api-server/package.json` postbuild is **unchanged**.

Do not deploy. Karen runs the deploy herself once this is verified.

If any step cannot be completed, stop and say which and why. A partial result reported honestly
is far more useful than a completed-sounding summary.
