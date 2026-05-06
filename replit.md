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
- `artifacts/api-server/src/routes/popularProducts.ts`: Weekly-refreshed "most popular product" computation (orders + wishlist score).
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

## Product

- **Customer-facing Storefront**: Product browsing (list, filters, detail pages), shopping cart, checkout (guest + registered), customer account management (order history, addresses), homepage "Popular Products" tile (refreshed weekly from purchases + wishlist).
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

## Gotchas

- When adding a new API endpoint that returns an image URL from Object Storage, **always** wrap it with `toPublicImageUrl()` from `artifacts/api-server/src/lib/imageUrl.ts` to ensure images render correctly in production.
- Client-side image references to raw filenames in `artifacts/web/src/assets/` will break in production; always `import` them or use aliases.
- Email images must be absolute HTTPS URLs; relative paths will not resolve in email clients.
- The `Resend` integration is currently in test mode; emails only deliver to the Resend account owner's address until a sender domain is verified and `RESEND_FROM_EMAIL` is configured.
- `drizzle-kit push` may be blocked by unrelated interactive prompts; direct psql ALTER commands are sometimes used for schema changes.
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