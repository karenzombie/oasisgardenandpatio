---
name: CatalogFabricOption has multiple producer routes
description: Adding a required field to a shared catalog response schema must update every route that builds it, or that endpoint 500s at .parse().
---

# CatalogFabricOption is built by several independent routes

The `CatalogFabricOption` schema (lib/api-spec/openapi.yaml) is produced by more
than one api-server route, each with its own hand-written Drizzle `.select({...})`:
- product by-slug `fabricOptions` (products.ts)
- public `/catalog/fabrics` (fabrics.ts) — the showroom fabric library page
- admin fabric CRUD/list (adminProductConfig.ts)

**Rule:** When you add a field to a shared catalog schema and mark it `required`
(even `["string","null"]`), you MUST add the matching column to EVERY producer
route's `.select({...})`. A missing column yields `undefined` (not `null`) on the
mapped object, and the route's `Response.parse(...)` throws → that endpoint 500s.

**Why:** A required+nullable field accepts `null` but NOT `undefined`. Omitting the
column from one route's select silently breaks only that endpoint, while the others
keep working — easy to miss in verification if you only test the by-slug PDP path.

**How to apply:** After editing a catalog schema's `required` list, grep every
producer for the schema name (or the field) and confirm each select includes the
new column. Smoke-test each endpoint for HTTP 200, not just the one you changed.
