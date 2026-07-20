# Follow-on: Stable Legal PDF URLs + Remove Redirect Flash

This is a small addition to the legal PDF documents work you just completed (Steps 1 through 5). It stands alone; you do not need to re-read the original brief. Same hard constraints apply: do not touch checkout, cart, or payment code; dev only (`DATABASE_URL`); never run `drizzle-kit push`; stop and report if anything does not match what is described.

## Why

Steps 1 through 5 are verified working: PDFs upload, publish, archive prior versions, and open on the customer side. The only issue is the flash you may have seen: clicking a legal link briefly renders the in-site legal page before it redirects to the PDF. That is the Option B redirect doing its intermediate render.

There are zero real customers and no bookmarked or emailed legal links to preserve, so the route-redirect is no longer needed. Replace it with stable per-type PDF URLs. This also becomes the canonical way any part of the app links to a legal document, including the upcoming account onboarding checkboxes (separate brief).

## Changes

1. **New public, unauthenticated endpoint, one stable URL per document type**, that 302-redirects to the current active version's served PDF URL. Suggested path shape: `GET /api/legal/:type/pdf`.
   - Validate `:type` against the four known types (`privacy_policy`, `terms_and_conditions`, `shipping_returns`, `warranty`).
   - Look up the active row for that type, redirect to its served PDF URL (the `/api/storage/public-objects/...` form).
   - If the active row has no PDF (a text-era row, only possible in an environment before the PDFs are uploaded), fall back to rendering the existing in-site text page for that type rather than returning 404. Do not delete the text renderer.

2. **Point every customer-facing legal link directly at these stable URLs** with `target="_blank"` and `rel="noopener"`:
   - The four footer links in `Footer.tsx`.
   - The warranty links in `Finishes.tsx` and `Fabrics.tsx`.
   - The Product.tsx warranty link (it becomes the stable warranty URL instead of `/warranty`).

   Because each link now goes straight to the redirect endpoint, the browser never renders an in-site page first, so there is no flash.

3. **Remove the Option B redirect logic from `LegalDocument.tsx`** (the `window.location.replace` on the in-site route added in Step 5). Keep the in-site text renderer itself, since the new endpoint in point 1 uses it as the text-era fallback. The four in-site routes (`/privacy-policy`, etc.) can remain as-is; they will no longer be linked from anywhere customer-facing, which is fine.

## Verification (then stop for approval)

- Clicking any customer-facing legal link (footer, the Product warranty tab, the Finishes and Fabrics warranty links) opens the current PDF in a new tab with no flash of an in-site page, at both desktop and mobile widths.
- Hitting a stable URL directly, e.g. `/api/legal/warranty/pdf`, redirects to the active warranty PDF.
- The site still compiles and loads.
- No checkout, cart, or payment file was touched.
