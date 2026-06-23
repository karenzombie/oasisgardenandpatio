## Replit Instructions: Schema Changes for Sub Category, Sub Material, and Tables Category

### Overview

Two things need to happen in this build: (1) add two new columns to the products table, and (2) add a new "Tables" category to the categories table. Both need to be in place before Karen runs the data backfill script.

---

### Preflight

Before making any changes, confirm:
1. The products table does not already have columns named `sub_category` or `sub_material`
2. The categories table does not already have a category named "Tables"

If either already exists, stop and flag it before proceeding.

---

### Change 1: Add New Category "Tables"

Add a new record to the categories table with the following values:

- **name:** Tables
- **slug:** tables
- **description:** Dining tables, occasional tables, coffee tables, side tables, and table bases

This category will be used for all O.W. Lee table products including dining tables, coffee and side tables, table bases, table tops, and counter height tables. It is distinct from the existing "Coffee & Side Tables" category (id 46) which will remain unchanged.

Add this category record via a migration or direct insert -- whichever pattern is consistent with how other categories are managed in this codebase.

---

### Change 2: Add sub_category and sub_material Columns to Products Table

In `lib/db`, add two new columns to the products table definition:

```
sub_category: text (nullable)
sub_material: text (nullable)
```

Both columns are optional with no default value. No index needed at this time. Follow the same pattern used for the existing `collection` column.

---

### Change 3: OpenAPI Spec

In `lib/api-spec`, add `sub_category` and `sub_material` as optional string fields to the product schema. Follow the same pattern as `collection`.

---

### Change 4: API Server

In `artifacts/api-server`, ensure `sub_category` and `sub_material` are included in:
- Product GET responses
- Product CREATE and UPDATE request handling

---

### Change 5: Admin UI

In `artifacts/web`, add both fields to the product edit form:
- Label: "Sub Category" and "Sub Material"
- Input type: plain text input (free text, not a dropdown)
- Placement: directly below the existing "Category" field
- Both fields are optional -- no validation required
- Show for all product categories (not conditional)

Also add "Tables" to the category dropdown in the product edit form so it appears as a selectable option.

---

### Change 6: Generate and Run Migration

Generate and run the Drizzle migration to apply all schema changes to the database.

---

### What NOT to Change

- Do not modify or remove the existing "Coffee & Side Tables" category (id 46)
- Do not make sub_category or sub_material required
- Do not add enum constraints -- they are free text
- Do not add sub_category or sub_material to the storefront product display pages -- admin only for now

---

### After Replit Confirms Complete

Please confirm:
1. The new "Tables" category was created and share its assigned ID
2. The sub_category and sub_material columns exist on the products table
3. The migration ran successfully

Karen will then run a Python backfill script in the shell.
