# Brief: Legal Documents as Uploaded PDFs

## Purpose

The four customer-facing legal documents (Privacy Policy, Terms & Conditions, Shipping & Returns, Warranty) change from staff-pasted text rendered in-site to staff-uploaded PDF files that open in a new tab when a customer clicks the link. Staff maintain them by uploading a replacement PDF; the newest published version is always the one customers see. The paste-text editing path is removed entirely.

The existing versioning model in `legal_documents` is kept exactly as is: publishing a new version deactivates the prior active version in the same transaction, history is preserved, and customers only ever get the `is_active = true` row.

This brief runs BEFORE the separate "Account Onboarding + Legal Acceptance" brief. That brief will link its checkboxes to whatever this brief builds.

## HARD CONSTRAINTS (read first)

- DO NOT touch checkout, cart, or payment code in any way: no changes to `checkout.ts`, the Authorize.net code, cart routes, or any checkout page components. Payments are live with real customers and cannot currently be re-tested. If you believe this work requires touching any of those files, STOP and say so.
- NEVER run `drizzle-kit push`. Known drift on `product_umbrella_sizes` means push offers a destructive TRUNCATE. All schema changes are applied to the dev database with plain SQL only.
- Dev only. Use `DATABASE_URL`. Never read or write `PROD_DATABASE_URL`. Prod schema and prod PDF uploads are handled separately by the project lead.
- Never modify or delete existing `legal_documents` rows. Old text versions stay in history untouched.
- Uploaded files are immutable per version: publishing a new version must never overwrite or delete a previous version's file.
- Do not add features beyond this brief. If anything in the codebase does not match what this brief describes, STOP and report what you found. Do not guess.

## Step 1: Recon (read only, then STOP)

Investigate and report back before writing any code:

1. How product images are uploaded and stored today (Replit object storage): the upload mechanism, how files are keyed, and how they are served to the public. The legal PDFs should reuse this same mechanism and storage. Confirm whether files served this way are publicly reachable by a customer's browser without authentication; a customer must be able to open the PDF directly in a new tab.
2. The current `legal_documents` table state in dev: list all rows (type, version, is_active, effective_date, content length). Do not modify anything.
3. Every place in the customer-facing frontend that links to any of the four legal pages (footer, and anywhere else; search thoroughly, including any signup or checkout-adjacent links, which you will list but NOT modify if they live in checkout files; flag those for review instead).
4. The staff Legal page (`artifacts/web/src/staff/pages/admin/Legal.tsx`) and its API (`adminLegal.ts`): confirm the publish and restore flows as they exist.
5. Propose at this checkpoint: the schema change for attaching a file reference to `legal_documents` (plain SQL), the upload size limit, and how non-PDF uploads will be rejected (both file extension and content type must be checked).

Post findings and STOP for approval before Step 2.

## Step 2: Schema (dev, plain SQL)

Apply the approved schema change from Step 1 with plain SQL to dev and update the matching Drizzle definition (definition only; no push). Requirements the change must satisfy:

- Each `legal_documents` row can reference one uploaded PDF file.
- Existing text-era rows remain valid rows with no file reference.
- Nothing about the existing versioning columns changes.

Paste the exact SQL you ran, then STOP for approval.

## Step 3: API

1. New admin-only upload-and-publish endpoint: staff uploads a PDF for a document type, with an optional version label (auto-increment when blank, matching current behavior) and an effective date. In one transaction, exactly like the current text publish: deactivate the prior active version, insert the new active row with the file reference, record history. Reject non-PDF uploads.
2. The public legal document endpoint returns the active row including the file URL when a file exists.
3. Restore: only versions that have a PDF file may be restored to active. Text-era versions remain visible in history but are not restorable. The restore endpoint must enforce this server side.
4. Remove the paste-text publish path from the admin API entirely.
5. Codegen proof, actual pasted output required: `pnpm --filter ./lib/api-spec run codegen && git status --short`.

STOP for approval after pasting the codegen output.

## Step 4: Staff UI

Rework the staff Legal page:

- Per document type: show the current active version with a link that opens its PDF in a new tab, plus effective date and version label.
- Upload flow: choose a PDF file, optional version label, effective date, publish. No text editor anywhere; remove it completely.
- Version history list stays, with restore available only on versions that have a PDF (per Step 3). Text-era versions display in history as not restorable.

## Step 5: Customer-facing links and routes

- Every link to the four legal documents opens the active PDF directly in a new tab (`target="_blank"` with `rel="noopener"`).
- The four existing routes (`/privacy-policy` etc.; confirm exact paths in recon) are kept so old bookmarks and emails do not 404: when the active version has a PDF, the route redirects to the PDF file.
- Transitional fallback, deliberate: when the active version has NO PDF (a text-era row, which is the state in prod immediately after the eventual publish and before staff upload the PDFs there), the existing in-site text rendering continues to work exactly as today. Do not delete the text renderer. This fallback prevents any window where legal pages are blank in prod. Once all four types have a PDF it never triggers.
- Any legal link that lives inside a checkout file is flagged, not modified (see hard constraints); report it and STOP.

## Checkpoints and verification

STOP after each step and wait for approval. Final acceptance is a hands-on dev walkthrough by the project lead:

1. Upload the four real PDFs in dev via the staff UI, one per type. Confirm each publish deactivates the prior version and history shows both.
2. Click every customer-facing legal link on desktop and mobile widths: each opens the correct, newest PDF in a new tab.
3. Visit each of the four routes directly: redirects to the PDF.
4. Confirm the paste-text path is gone from the staff UI and API.
5. Attempt to upload a non-PDF: rejected. Attempt to restore a text-era version: rejected.
6. Read-only DB check: active rows carry the expected file references and versions; no pre-existing row was modified.

A green build or typecheck proves nothing on its own.

## Out of scope

- Prod schema application, prod PDF uploads, and the deploy (handled separately; sequencing note for the project lead: prod plain SQL first, then the publish, then upload the four PDFs in prod via the staff UI immediately, since files and legal rows do not sync from dev)
- The onboarding and acceptance feature (separate brief, runs after this one)
- Any change to what the documents say (content is supplied by the project lead as PDFs)
