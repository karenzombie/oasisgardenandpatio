## Replit Instructions: Add sub_category and sub_material Fields to Products

### Overview

We need to add two new text columns to the `products` table: `sub_category` and `sub_material`. These are free text fields that provide more granular classification below the category level. For example, a product in the "Dining" category might have a sub_category of "Dining Chair" or "Bar & Counter Stools".

---

### Preflight

Before making any changes, confirm the current `products` table does not already have columns named `sub_category` or `sub_material`. If either exists, stop and flag it.

---

### Step 1 -- Database Schema (Drizzle)

In `lib/db`, add the two new columns to the products table definition:

```
sub_category: text (nullable)
sub_material: text (nullable)
```

Both columns are optional (nullable) with no default value. No index needed at this time.

Follow the same pattern used for the existing `collection` column.

---

### Step 2 -- OpenAPI Spec

In `lib/api-spec`, add `sub_category` and `sub_material` as optional string fields to the product schema. Follow the same pattern as `collection`.

---

### Step 3 -- API Server

In `artifacts/api-server`, ensure `sub_category` and `sub_material` are included in:
- Product GET responses
- Product CREATE and UPDATE request handling

---

### Step 4 -- Admin UI

In `artifacts/web`, add both fields to the product edit form:
- Label: "Sub Category" and "Sub Material"
- Input type: plain text input (free text, not a dropdown)
- Placement: add them directly below the existing "Category" field in the product edit form
- Both fields are optional -- no validation required
- These fields should show for all product categories (not conditional)

---

### Step 5 -- Generate and Run Migration

Generate and run the Drizzle migration to apply the schema change to the database.

---

### What NOT to Change

- Do not add these fields to the storefront-facing product display pages -- they are admin/data fields only for now
- Do not make them required
- Do not add enum constraints -- they are free text

---

### After Replit Confirms Complete

Karen will run a Python script in the shell to backfill the values for all O.W. Lee products.
