# Brief: Account Onboarding + Legal Acceptance (Phase 1)

## Purpose

Two related features for customer accounts:

1. New signups land on My Account in an "onboarding" mode where they must enter their name (required) and accept the Terms & Conditions and Privacy Policy before using the site.
2. Every acceptance is recorded with a timestamp and document version in the database, shown on the customer's My Account page, and shown in the staff UI customer detail.

Existing customers are gated too: any signed-in customer who has not yet accepted both documents gets the same gate on their next visit.

This brief is self-contained. It describes three screen states in full: the signup onboarding view, the normal account view, and the staff customer-detail block. Build to the written descriptions in Steps 4 and 5; do not invent additional UI beyond what is specified.

This brief runs AFTER the "Legal Documents as Uploaded PDFs" brief. Legal documents are now PDF files uploaded per version; customer-facing legal links open the active PDF in a new tab, with the four legal routes redirecting to the active PDF. This brief builds on that state.

## HARD CONSTRAINTS (read first)

- DO NOT touch checkout, cart, or payment code in any way. This includes but is not limited to: `artifacts/api-server/src/routes/checkout.ts`, `artifacts/api-server/src/lib/authorizeNet.ts` (or wherever the Authorize.net code lives), any cart routes, the Checkout page components, and the checkout quote logic. Payments are live with real customers and cannot currently be re-tested. If you believe this work requires touching any of those files, STOP and say so. Do not proceed.
- NEVER run `drizzle-kit push`. There is known schema drift on `product_umbrella_sizes` and push will offer to TRUNCATE a live table. All schema changes in this brief are applied to the dev database with plain SQL only.
- Dev database only. Use `DATABASE_URL`. Never read or write `PROD_DATABASE_URL`. Prod schema and deploy are handled separately by the project lead after this brief is verified in dev.
- Do not modify Clerk configuration, Clerk redirect settings, or the Clerk sync handler in `auth.ts`. The "land on My Account after signup" behavior is delivered entirely by the frontend gate in Step 4, not by changing where Clerk redirects.
- No emails are sent by anything in this brief.
- Do not add features beyond this brief. No password logic, no address changes, no marketing preference changes.
- If anything in the codebase does not match what this brief describes, STOP and report what you found. Do not guess or improvise.

## Step 1: Recon (read only, then STOP)

Investigate and report back before writing any code:

1. Confirm the `legal_documents` table contents in dev: confirm there is exactly one `is_active = true` row for `privacy_policy` and one for `terms_and_conditions`, that each active row has a PDF file reference, and report their `id`, `version`, and file reference. If either active row is missing or lacks a PDF, STOP and report; the project lead will upload before work continues. Do not create documents or upload files yourself.
2. Confirm where a brand-new Clerk signup lands after account creation (the post-signup redirect target) and how the frontend knows the signed-in user's role.
3. Confirm how the My Account page (`artifacts/web/src/pages/Account.tsx`) loads the profile, and identify the profile API response type that will need new fields.
4. Confirm which staff UI page/component renders the customer detail section.
5. Confirm the two stable legal PDF URLs (`/api/legal/terms_and_conditions/pdf` and `/api/legal/privacy_policy/pdf`, built by the prior brief) resolve to the active PDFs. These are what the onboarding checkboxes link to.

Post findings and STOP for approval before Step 2.

## Step 2: Schema (dev, plain SQL)

New append-only table `customer_legal_acceptances`. One row per acceptance event, never updated or deleted. Latest row per document type is the current acceptance.

- `id` serial primary key
- `customer_id` integer not null, FK to `customers(id)` on delete cascade
- `document_type` text not null, check constraint limiting to `privacy_policy` and `terms_and_conditions`
- `document_id` integer not null, FK to `legal_documents(id)`
- `document_version` text not null (copied from the legal_documents row at acceptance time, so the record survives later document edits)
- `accepted_at` timestamptz not null default now()
- Index on `customer_id`

Apply with plain SQL to dev. Add the matching Drizzle table definition to `lib/db/src/schema` so code and DB agree (definition only; no push).

Paste the exact SQL you ran and the Drizzle definition, then STOP for approval.

## Step 3: API

All in the account routes (`artifacts/api-server/src/routes/account.ts`) unless recon showed a better home:

1. Extend the account profile response with:
   - `legalAcceptances`: for each of the two document types, either `{ acceptedAt, documentVersion }` or null.
   - `onboardingRequired`: true when the customer's trimmed `first_name` or `last_name` is empty OR either document type has no acceptance row.
2. New endpoint to record acceptance (authenticated customer only). The client sends only which document types are being accepted. The server looks up the currently active `legal_documents` row for each type and records `document_id`, `document_version`, and `accepted_at` server side. The client never supplies ids, versions, or timestamps. If no active document row exists for a requested type, return an error; do not invent data.
3. Accepting when an acceptance row already exists for that type simply inserts a new row (append only). The UI will not normally allow this, but the API must not corrupt data if it happens.
4. Run codegen and prove it clean: `pnpm --filter ./lib/api-spec run codegen && git status --short`. Paste the actual command output. A green typecheck alone is not acceptance.

STOP for approval after pasting the codegen output.

## Step 4: Customer frontend

### Gate behavior

- Gate condition = signed-in user with role `customer` whose profile has `onboardingRequired = true`.
- Implement the gate at the app router or layout level (a wrapper around routing), never inside individual pages and never inside any checkout or cart component.
- The gate must only engage after the profile has actually loaded. While the profile is loading or errored, render normally and do not redirect. No redirect loops, no flash-redirects for accepted customers.
- While gated, navigating anywhere on the site redirects to `/account`. The gate must NOT block: logging out, the two stable legal PDF URLs (`/api/legal/terms_and_conditions/pdf` and `/api/legal/privacy_policy/pdf`; customers must be able to read what they are accepting), and the marketing opt-out route `/account/preferences/opt-out` (email unsubscribe links must always work without barriers; this is a legal requirement, verify the exact route during recon).
- Staff users (admin, agent) are never gated. Guests (not signed in) are never gated and are completely unaffected by this brief.

### Onboarding mode on /account

Shown when `onboardingRequired` is true:

- Banner at top: "Finish setting up your account" with one line of explanation.
- Profile fields inline and editable: First Name (required), Last Name (required), Phone (optional). Email is displayed read only, pre-populated from the account.
- Terms & Privacy section with two checkboxes, one per document, each linking to that document's stable PDF URL (`/api/legal/terms_and_conditions/pdf` and `/api/legal/privacy_policy/pdf`, built in the PDF brief) so the current active PDF opens in a new tab (`target="_blank"` with `rel="noopener"`) and the account page state is not lost. Helper text notes that acceptance date and time will be recorded.
- A single "Save and continue" action, disabled until first name and last name are non-empty (trimmed) and both boxes are checked. It may orchestrate two API calls (profile save, then acceptance). If either call fails, show the error, stay in onboarding, and re-derive the remaining state from the server on retry (for example name already saved, acceptance still missing). The server-computed `onboardingRequired` is the single source of truth; the client never decides it is done on its own. On success the page transitions to the normal account view.
- Existing customers with a name already on file see the same page with their name pre-filled; only the checkboxes block them.

### Normal account view

- New "Terms & Privacy" section placed directly above "Marketing contact preference".
- Each document shows a locked checked state with "Accepted {date} at {time} PT" using the recorded timestamp, displayed in Pacific time.
- No way to un-accept from the UI.

## Step 5: Staff UI

In the customer detail section:

- "Legal Acceptances" block showing both document types. Each shows either an "Accepted" pill with date, time (PT), and the accepted version, or a "Not accepted" pill.
- Read only. Staff cannot accept on a customer's behalf. Walk-in customers created by staff will show "Not accepted"; that is correct and expected.

## Checkpoints and verification

STOP after each step above and wait for approval. After Steps 4 and 5, the project lead will run a hands-on dev walkthrough:

1. Fresh signup lands in onboarding, cannot navigate away, cannot save without name and both checks, then completes and sees timestamps.
2. The "existing customer" state (name on file, no acceptance) is manufactured for testing: complete a signup fully, then delete that one customer's rows from `customer_legal_acceptances` with a one-off dev SQL (dev is disposable). Revisiting the site must re-gate that customer into the shorter checkbox-only flow.
3. Staff detail shows correct pills for an accepted and a not-accepted customer.
4. A read-only query of `customer_legal_acceptances` confirms the rows carry the correct customer_id, document_id, version, and timestamps.

A green build or typecheck proves nothing on its own. The walkthrough plus the DB check is the acceptance test.

## Out of scope

- Prod schema application and deploy (handled separately after dev verification; note for the project lead, not the agent: prod goes live in this order, all before customers hit the gate: (1) plain SQL for BOTH briefs' schema changes, (2) the single publish carrying both features, (3) upload the four PDFs in prod via the staff UI immediately, since files and legal rows do not sync from dev; until step 3 the checkbox links serve the text fallback pages, which is acceptable)
- Guest checkout acceptance
- Address changes of any kind (that is Phase 2)
- Re-acceptance flows for future document version changes (the append-only table supports it later; do not build UI for it now)
