---
name: Legal document CMS end-to-end wiring
description: How the 4 legal document types (privacy_policy, terms_and_conditions, shipping_returns, warranty) connect admin edits to the live customer site.
---

The admin Legal CMS (`Legal.tsx` + `adminLegal.ts` + DB schema) already supported all 4 document types from the start. The gap was entirely on the read/render side:

- Public route `artifacts/api-server/src/routes/legal.ts` had a hardcoded `LEGAL_TYPES` allowlist that only included 2 of the 4 types — it silently 500'd/blocked the other two even though the OpenAPI enum and generated hook supported them.
- Customer pages (`PrivacyPolicy.tsx`, `TermsAndConditions.tsx`, `ShippingReturns.tsx`, `Warranty.tsx`) never called the API at all — they rendered `ComingSoon` or static hardcoded JSX.
- Footer linked all 4 documents to static PDFs in `public/`, bypassing the CMS entirely.

**Why:** a full audit of "is the CMS wired up" must check the entire chain (admin write → public read route → customer render → footer/nav links), not just the admin CRUD surface. Admin CRUD looking complete does not mean the public site reflects it.

**How to apply:** there is now a single shared `artifacts/web/src/pages/LegalDocument.tsx` component (takes a `type` prop, all 4 pages are thin wrappers around it) that fetches via `useGetLegalDocument`, shows a loading skeleton, and falls back to `ComingSoon` if no active document exists (404/error). Content is rendered as plain paragraphs with numbered-heading detection (`^\d+\.\s+`) — no markdown library is installed despite the admin field being labeled "Markdown"; if real markdown rendering is ever required, `react-markdown` would need to be added as a new dependency. Initial v1 content for all 4 types lives in `scripts/src/seed.ts` (`seedLegalDocuments`), sourced from the original static PDFs.
