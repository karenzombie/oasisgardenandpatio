# Oasis Garden & Patio

A full-stack e-commerce platform for a luxury outdoor furniture retailer, supporting online orders, in-store sales, inventory, purchasing, and CMS.

## Run & Operate

- `pnpm run typecheck`: Runs a full typecheck across all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas after editing `lib/api-spec/openapi.yaml`.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/scripts exec tsx src/seed.ts`: Run the idempotent seed script.
- **Required Env Vars**: `RESEND_API`, `RESEND_FROM_EMAIL` (for transactional emails).

## Stack

- **Monorepo**: pnpm workspaces, TypeScript 5.9, Node.js 24
- **Frontend**: React + Vite, wouter, TanStack Query, Tailwind + shadcn/ui
- **API**: Express 5, OpenAPI (contract-first), Orval codegen
- **DB**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **Logging**: Pino (server-side)

## Where things live

- `lib/db/src/schema/index.ts`: Database schema barrel file.
- `lib/api-spec/openapi.yaml`: Single source of truth for the API contract.
- `artifacts/api-server/src/routes/index.ts`: API route registry.
- `artifacts/api-server/src/routes/products.ts`: `/products/featured` route — staff-curated featured products for the homepage carousel, ordered by `featuredAt DESC NULLS LAST, displayOrder ASC, name ASC`. Filtered to active + online so cards always link to a valid PDP.
- `artifacts/api-server/src/lib/autoGenerateVendorOrders.ts`: Shared helper that auto-creates pending vendor POs (grouped by manufacturer) on every customer order. Called by `/checkout` and `/admin/orders`. Locks candidate rows `FOR UPDATE` for idempotency.
- `artifacts/api-server/src/lib/vendorOrderPdf.tsx`: React-PDF vendor PO + cancellation docs. Logo is inlined via `oasisLogoData.ts` (base64) so it survives the esbuild bundle. PO Ship-To uses Oasis address by default; switches to customer shipping address when `orders.shipToStore = false`.
- `scripts/src/seed.ts`: Idempotent seed script.
- `artifacts/web/src/App.tsx`: Frontend routing entry point.
- `attached_assets/Oasis_Build_Spec_v2.5_*.docx`: Primary functional specification.
- `attached_assets/Oasis_Addendum_1_*.docx`: Staff/admin portal specification.
- `attached_assets/`: Static images (logos, hero, fixed category tiles, brand marks).
- `artifacts/web/public/`: Files served at the site root.
- `artifacts/api-server/src/lib/imageUrl.ts`: Image URL helper, especially `toPublicImageUrl()`.

## Architecture decisions

- **Two-shell UI**: Distinct layouts for customer (header/footer) and staff (sidebar/topbar) interfaces, with no shared layout components.
- **Identity Model**: Separates `users` (authentication) from `customers` (contact/order info), allowing for in-store customers without full user accounts.
- **Image Handling**: Differentiates between static assets (bundled), public directory files (served directly), and admin-uploaded images (Replit Object Storage via API proxy). Public-facing API routes must wrap image URLs with `toPublicImageUrl()`.
- **Order Numbering**: Follows `OG-YYYY-XXXXX` for customer orders and `VO-YYYY-NNNNN` for vendor orders.
- **Payment & Tax**: Authorize.net for online payments, with TaxJar for online order tax calculations. In-store orders may bypass payment steps and use a flat local tax rate.
- **Staff order builder ↔ PDP parity**: The staff order picker (`artifacts/web/src/staff/pages/agent/NewOrder.tsx` `ProductPickerDialog`, shared by normal/quick-order/restock modes) must surface EVERY option dimension the customer PDP shows. Option visibility is driven by *presence of options*, never by pricing mode — show discrete finishes whenever `finishes.length > 0` (never gate on grade mode), same for fabrics/variants. The dialog computes the canonical per-unit price once (grade / frame-only / base+variant adj, plus finish upcharge) and passes it to `applyPickedProduct`; the line-item code must not recompute price. The picker endpoint `GET /admin/products/:id/picker` mirrors the customer `by-slug` shape (discrete finishes with `upchargeMsrp`/`upchargeSale`/`description`/`minOrderQty`).
- **Note to Vendor vs. internal notes**: `vendor_orders.note_to_vendor` is a message TO the manufacturer, separate from internal staff `notes`. Settable on standalone create, editable while the PO is pending (incl. auto-generated POs, which default it to null), and rendered **bold, ALL-CAPS at the very top** of the vendor PO PDF.
- **Shipping single source of truth**: The admin **Shipping** page (`artifacts/web/src/staff/pages/admin/Shipping.tsx`, Sales nav) is the only source of shipping rates for **external customer ONLINE orders**. The engine `artifacts/api-server/src/lib/shippingRules.ts` (`loadShippingConfig` + `computeShippingForLines`) is consumed by `cart.ts` + `checkout.ts`. Rules stack: scopes A–D (site-wide, category[+optional sub_category], manufacturer, specific products) SUM per line item; the by-weight tier (fixed bounds 0-50/51-100/101-200/201-500/501+) adds once per order on total weight. Flat = rate×qty; percentage = rate%×(unitPrice×qty). Shipping is never taxed; `shipToStore` ⇒ $0. **Staff/in-store orders (walk-in/quick/restock) default to $0 shipping** (`adminOrdersPricing.ts` returns `deliveryAmount=0`); staff may enter a manual flat amount in the order builder (`NewOrder.tsx` deliveryMode auto/manual) — the rules engine never applies to staff orders. The old settings-driven shipping (shipping_mode/flat_shipping_rate/shipping_percentage/free_shipping_threshold/shipping_tiers) was fully removed; `checkoutPricing.ts` is now tax-only.
- **Product visibility vs. purchasability**: `available_online` controls whether a product is *visible* on the storefront — every customer route (search, listings, facets, PDP) requires `available_online = true`. Purchasability is separate: a visible product shows **Add to Cart** only when it has a price and `show_price_online` is on (and not quote-only); otherwise it shows **Call for Price** but stays visible. **New products ALWAYS default to visible** (`available_online = true`) on every creation path — DB column default, admin "Add Product" form, create API route, and CSV import. Staff can later hide a product or enable Add-to-Cart-with-price through the admin UI.

## Product

- **Customer-facing Storefront**: Product browsing (list, filters, detail pages), shopping cart, checkout (guest + registered), customer account management (order history, addresses), homepage "Featured Products" carousel (staff-curated via the product `featured` toggle; `featuredAt` records when each was flagged for ordering).
- **Staff/Admin Portal**:
    - **CRUD Operations**: Manufacturers, categories, products (with variants, fabrics, multi-image management), carriers, banners, legal documents.
    - **Inventory Management**: Manual adjustments, location tracking, and linking to vendor orders.
    - **Order Management**: View, filter, and manage customer orders, including status transitions, notes, and cancellation reviews.
    - **Vendor Order Management**: Generate, send, track, and receive vendor orders, including partial cancellations and inventory restocks.
    - **User Management**: Create/manage staff accounts (with roles, 2FA, password reset), manage customer accounts (activate/deactivate).
    - **Reporting**: Sales summaries, sales by agent, manufacturer, and category, with CSV export.
    - **Audit Log**: Tracks user actions, changes, and system events.
    - **Bulk Product Update**: Efficiently update multiple product fields and fabric associations.
    - **Staff Order Creation**: In-store order building for walk-in/existing customers, including quick orders and internal restock orders.
    - **Order Delivery Tracking**: Manage shipping methods and shipment details for orders.
    - **Order Partial Payments**: Record and track deposits and partial payments for orders.
- **Key Integrations**: Resend (transactional email), Authorize.net (payments), TaxJar (tax), Replit Object Storage (product images).

## User preferences

- I want iterative development.
- Ask me for clarification instead of making assumptions on ambiguous build decisions.
- Do not make changes to files outside the `artifacts/web` and `artifacts/api-server` directories without explicit instruction.
- I prefer clear, concise communication and detailed explanations for complex technical concepts.
- When I ask for something and it's finished, mark the task done right away so we don't lose track of what's still open. If you're unsure whether to close it out, prompt me with "mark this task done".
- **Never carry work over as "in progress" or "incomplete" unless I explicitly tell you to.** When a piece of work is finished, fully close it out — do not leave stale plans, session plans, or task files lingering that resurface in later turns. If you're not certain whether something is done, ask me before marking it complete rather than leaving it open. Delete completed `.local/session_plan.md` and any other completed plan files so they don't reappear.
- **Before any publish**: run a full readiness audit — identify the last publish commit, list every task completed since, verify each one is reflected in prod (schema, seed data, post-merge.sh coverage, dev/prod count cross-checks), typecheck clean, check-image-urls clean. Report mismatches before publishing, not after.

## Gotchas

- **Image URLs in API responses MUST be wrapped.** Any DB column holding an Object Storage path (`swatchImageUrl`, `primaryImageUrl`, `imageUrl`, `logoUrl`, `url` in image arrays, `pdfStorageUrl`) must be passed through `toPublicImageUrl()` from `artifacts/api-server/src/lib/imageUrl.ts` before being sent in a JSON response. Raw `/objects/...` paths only resolve inside the API container — browsers will 404. Run `pnpm --filter @workspace/scripts exec tsx src/checkImageUrls.ts` (registered as the `check-image-urls` validation) to audit all key endpoints before publishing.
- Client-side image references to raw filenames in `artifacts/web/src/assets/` will break in production; always `import` them or use aliases.
- Email images must be absolute HTTPS URLs; relative paths will not resolve in email clients.
- The `Resend` integration is currently in test mode; emails only deliver to the Resend account owner's address until a sender domain is verified and `RESEND_FROM_EMAIL` is configured.
- `drizzle-kit push` may be blocked by unrelated interactive prompts; direct psql ALTER commands are sometimes used for schema changes.
- `customers.user_id` MUST be a plain `UNIQUE` constraint (not a partial unique index). Postgres can't infer a partial index for `INSERT … ON CONFLICT (user_id) DO NOTHING`, which silently breaks Clerk signup (clerk-sync 500s, user never gets a local session, no row in the staff customer list). Walk-in customers (user_id NULL) still coexist freely because PG treats multiple NULLs as distinct under a regular UNIQUE.
- `onConflictDoUpdate` is not used in the vendor data loader; concurrent runs could lead to issues.
- The inventory mode exclusivity (variant rows vs. variant-null rows for the same product) is enforced at the application layer, not purely via DB constraints.
- Admin portal pricing calculations (tax, shipping) for new orders mirror customer-facing logic; overrides are possible.

## Pointers

- **OpenAPI Specification**: `lib/api-spec/openapi.yaml` for API contract details.
- **DB Schema**: `lib/db/src/schema/index.ts` for database structure.
- **Drizzle ORM Documentation**: _Populate as you build_
- **Tailwind CSS Documentation**: _Populate as you build_
- **React Query Documentation**: _Populate as you build_
- **Clerk Authentication Documentation**: _Populate as you build_
- **Authorize.net Accept.js Documentation**: _Populate as you build_
- **TaxJar API Documentation**: _Populate as you build_
- **Resend API Documentation**: _Populate as you build_