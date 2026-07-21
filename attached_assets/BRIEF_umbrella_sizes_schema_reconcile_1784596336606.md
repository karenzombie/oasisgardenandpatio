# Agent Brief: reconcile product_umbrella_sizes schema (code edit only)

## Scope and hard limits (read first)

This is a **code edit only**. You are editing exactly one file. You do this and nothing else.

DO NOT:
- DO NOT run `drizzle-kit push`.
- DO NOT run `drizzle-kit generate`, `drizzle-kit migrate`, or any migration.
- DO NOT connect to, query, alter, or truncate any database (dev or prod).
- DO NOT run any deploy or sync.
- DO NOT edit any file other than the one named below.
- DO NOT "apply" the schema. The database is already correct. This edit only makes the code match it.

If anything about this brief is unclear, STOP and ask before making any change.

## Why

The live `product_umbrella_sizes` table already has a composite primary key named `product_umbrella_sizes_pkey` and a foreign key named `product_umbrella_sizes_product_id_fkey`. The Drizzle schema in code currently declares a `unique` constraint instead of the primary key, and names the foreign key differently. This mismatch means a `drizzle-kit push` would offer to truncate the table. This edit changes the code to match the live table exactly, so the code and database agree and no destructive change is ever proposed. No data is touched.

## The one file to edit

`lib/db/src/schema/products.ts`

## Change 1 of 2: add `primaryKey` to the import

Find this import block at the top of the file:

```ts
import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
```

Add `primaryKey,` to the list (any position is fine). Result:

```ts
import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
```

Note: `foreignKey` is already imported. Leave `unique` in the import list, it is used by other tables.

## Change 2 of 2: replace the product_umbrella_sizes table definition

Find this exact block:

```ts
export const productUmbrellaSizesTable = pgTable(
  "product_umbrella_sizes",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    sizeLabel: text("size_label").notNull(),
  },
  (t) => [
    unique("product_umbrella_sizes_unique").on(t.productId, t.sizeLabel),
    index("idx_product_umbrella_sizes_size_label").on(t.sizeLabel),
  ],
);
```

Replace it with exactly this:

```ts
export const productUmbrellaSizesTable = pgTable(
  "product_umbrella_sizes",
  {
    productId: integer("product_id").notNull(),
    sizeLabel: text("size_label").notNull(),
  },
  (t) => [
    primaryKey({
      name: "product_umbrella_sizes_pkey",
      columns: [t.productId, t.sizeLabel],
    }),
    foreignKey({
      columns: [t.productId],
      foreignColumns: [productsTable.id],
      name: "product_umbrella_sizes_product_id_fkey",
    }).onDelete("cascade"),
    index("idx_product_umbrella_sizes_size_label").on(t.sizeLabel),
  ],
);
```

What changed and why:
- The inline `.references(...)` was removed from the `productId` column and re-declared below as a named `foreignKey(...)` with the name `product_umbrella_sizes_product_id_fkey`, matching the live database.
- The `unique("product_umbrella_sizes_unique")` line was replaced with a named `primaryKey(...)` called `product_umbrella_sizes_pkey`, matching the live database.
- The index line is unchanged.
- The two columns and their `notNull` are unchanged.

## After editing

1. Run a TypeScript check to confirm the file still compiles (typecheck only, no database, no push). Paste the result.
2. Show the diff of `lib/db/src/schema/products.ts` (`git diff lib/db/src/schema/products.ts`). Paste it.
3. STOP. Do not commit, push, deploy, or run any database command. Wait for confirmation before doing anything else.

## Definition of done for this brief

The single file is edited to match the two blocks above, it typechecks, and the diff has been pasted for review. Nothing else.
