---
name: Explicit IDs for new DB records across dev+prod
description: When seed/import scripts create new catalog records that will exist in both dev and prod, IDs MUST be explicit and matching. Auto-increment diverges silently.
---

## The rule

When adding any new catalog record (finishes, fabrics, products, collections, etc.) via a seed or import script that will run against both dev and prod databases, **always use explicit IDs** in the INSERT. Never rely on auto-increment/serial for these records.

## Why

- Dev and prod have independent `SERIAL` sequences
- Running the same `INSERT` without `id` on dev then prod produces **different IDs** for the same logical row
- Junction tables (`product_finish_options`, `product_fabric_options`, etc.) and foreign-key references break on the next sync
- Product wiring, cart references, and any hardcoded IDs in scripts become inconsistent

## How to apply

### Method 1: Raw SQL with `ON CONFLICT (id) DO UPDATE`

```typescript
import { sql } from "drizzle-orm";

await db.execute(sql`
  INSERT INTO finishes (id, manufacturer_id, name, image_url, collection, is_active, display_order, created_at, updated_at)
  VALUES (515, 16, 'Anthracite Grey', '/objects/...', 'Polyethylene', true, 0, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    manufacturer_id = EXCLUDED.manufacturer_id,
    name = EXCLUDED.name,
    image_url = EXCLUDED.image_url,
    collection = EXCLUDED.collection,
    updated_at = NOW()
`);
```

### Method 2: Pick an explicit ID range

- Check the current `MAX(id)` from the table
- Pick a contiguous block well above that (e.g., +100 or +1000)
- Use those IDs consistently across both environments
- After insertion, reset the sequence: `SELECT setval('table_id_seq', new_max, true)`

### When is auto-increment OK?

- Transactional data that is environment-local only: orders, customers, carts, payments, audit logs
- Data that will never be referenced by ID from the other environment
- Data that is created via the admin UI (not seed scripts)

### Always-explicit tables

- `finishes`
- `fabrics`
- `finish_collections`
- `categories`
- `manufacturers`
- `products` (when bulk-importing from vendor data)
- Any table where rows are referenced by ID in junction tables or hardcoded in scripts

## How to detect violations

Before any publish or sync:
- Compare `SELECT id, name FROM <table> ORDER BY id` between dev and prod
- If the same logical row has different IDs, you have a divergence
- The fix: delete from both environments and re-insert with explicit matching IDs
