# Follow-on: Account Onboarding fixes + Step 5 (staff block)

This adds to the account onboarding + legal acceptance work you just built
(Steps 1 through 4). It stands alone; you do not need to re-read the original
brief. Same hard constraints apply: do NOT touch checkout, cart, or payment
code; dev only (`DATABASE_URL`); never run `drizzle-kit push`; reuse existing
endpoints where noted; stop and report if anything does not match what is
described.

Four changes, then a verification checkpoint.

## 1. Remove the "Legal Agreements" label from the customer UI (both places)

- In the onboarding view (`OnboardingView.tsx`), remove the "Legal Agreements"
  section header above the two checkboxes. The two checkbox rows remain, with no
  heading above them. The documents and checkboxes are self-explanatory.
- If any equivalent header sits above the acceptance checkboxes/section anywhere
  else in the customer-facing account UI, remove it there too.
- Do NOT change the staff UI label (see item 4); "Legal Agreements" or similar is
  fine on the staff side.

## 2. Build the missing My Account acceptance display

Step 4 was supposed to include this on the normal account view but it was not
built. On the normal (non-onboarding) My Account page, add a section showing the
two documents' acceptance status, placed directly above "Marketing contact
preference":

- Keep a small section header here reading "Terms & Privacy" (this matches the
  other account-page section headers like Profile, Email, Addresses). This is the
  one place a header stays; it is NOT the "Legal Agreements" label from item 1.
- For each of the two documents (Privacy Policy, Terms & Conditions): show it as
  accepted with the recorded date and time, using the `legalAcceptances` data
  already on the account profile response (`acceptedAt`, `documentVersion`).
  Display the timestamp in Pacific time.
- Read-only. No way to un-accept. Since a customer only reaches the normal account
  view after passing the gate, both will always show as accepted here.

## 3. Fix the post-signup homepage flash

New signups currently land on the homepage for a moment before the gate redirects
them to `/account`, causing a visible flash. Land new signups directly on
`/account` instead. Confirm during recon whether this is best done via the Clerk
component's post-signup redirect target (`fallbackRedirectUrl` in
`ClerkAuthPages.tsx`) or another mechanism, and report which you used. Do NOT
change any other Clerk configuration. The gate must remain the real enforcement;
this only changes the landing destination to avoid the flash.

## 4. Step 5: staff Legal Acceptances block

In the staff customer detail dialog (`ViewCustomerDialog` in
`artifacts/web/src/staff/pages/agent/Customers.tsx`), add a "Legal Acceptances"
block using the `legalAcceptances` field already added to the admin customer
detail response:

- For each document type (Privacy Policy, Terms & Conditions): show an "Accepted"
  state with date, time (Pacific), and the accepted `documentVersion`; or a "Not
  accepted" state when the value is null.
- Read only. Staff cannot accept on a customer's behalf. Customers created by
  staff, or existing customers who have not yet passed the gate, will show "Not
  accepted"; that is correct and expected.

## Verification (then stop for approval)

Reality-test, not just a typecheck. Confirm in dev:

1. Onboarding view: no "Legal Agreements" header; the two document checkboxes are
   present and function; Save and continue stays disabled until both names are
   filled and both boxes checked.
2. Complete onboarding, then the normal account view shows the "Terms & Privacy"
   section above Marketing preference with both acceptance timestamps.
3. New signup lands on `/account` with no homepage flash.
4. Staff customer detail shows the Legal Acceptances block: an accepted customer
   shows timestamps and versions; a customer with acceptance rows removed shows
   "Not accepted".
5. Site compiles and loads. No checkout, cart, or payment file was touched.

Testing note: because the dev Clerk instance is limited, you do not need a brand
new signup to test the gate. To reproduce the "existing customer, not yet
accepted" state, take a completed customer and delete only their rows from
`customer_legal_acceptances` with a one-off dev SQL, then revisit.
