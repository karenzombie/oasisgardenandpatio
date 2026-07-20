# AGENT BRIEF: Multiple contacts per vendor (manufacturer_contacts)

## Context

The admin "Vendors" page edits the `manufacturers` table. Today each manufacturer
has a single `sales_email` field (labeled "Sales / rep email"). Several real vendors
have more than one rep, and one field cannot hold them. This feature adds the ability
to store and self-manage multiple contacts per vendor.

This is purely additive. Nothing is removed. The existing `order_email`,
`sales_email`, and `order_method` fields and their form inputs stay exactly as they
are. `sales_email` is kept in the schema and the form; it simply stops being the only
place reps live.

Verified facts (from the code, July 19):
- `sales_email` is reference-only. Nothing in the vendor-order / PO send path reads
  it. Adding a contacts table does not touch how POs are emailed.
- The PO recipient is resolved as `sentToEmail override || manufacturers.order_email`
  in `artifacts/api-server/src/routes/adminVendorOrders.ts`. This feature must not
  change that path.
- The schema barrel `lib/db/src/schema/index.ts` re-exports everything in
  `manufacturers.ts` via `export * from "./manufacturers"`.
- Admin manufacturer routes live in `artifacts/api-server/src/routes/manufacturers.ts`
  and gate on `requireRole("admin")`. The detail payload is a flat field mapper.

## Locked decisions

1. Additive only. Keep `sales_email` in the DB and in the form. Add a new
   `manufacturer_contacts` table and a new "Vendor contacts" UI section alongside the
   existing fields.
2. Contact fields (approved): `name` (required), `email`, `phone`, `role`,
   `is_primary`, `display_order`. Email, phone, and role are optional.

## WHAT THE AGENT MUST NOT TOUCH

- The vendor-order send path: `adminVendorOrders.ts`, `vendorOrderEmail.ts`,
  `autoGenerateVendorOrders.ts`. This feature is contacts only.
- `order_email`, `sales_email`, `order_method`, and how the PO recipient is resolved.
- Any cart, checkout, or order-placing code. None of it is involved here.
- Do NOT run `drizzle-kit push`. See the Step 1 warning. Apply the new table with
  plain SQL in dev. Prod is applied separately by Karen.
- Do NOT "fix," refactor, or clean up anything you notice outside this task. Report
  it in your check-in and stop.

## Reporting discipline

- Every check-in must cite exact file paths and the exact lines or conditions you
  changed. A report with no file references means you did not actually look.
- If you cannot determine something, say "I could not determine this" and stop. Do
  not guess and do not fabricate.

## STEP 1: schema (dev only, plain SQL, NO drizzle-kit push)

WARNING: do NOT run `drizzle-kit push`. There is known pre-existing drift on
`product_umbrella_sizes` where a push proposes TRUNCATING that table (114 rows).
Running push to add this table could trigger that unrelated truncate. Avoid push
entirely and apply the new table with the plain SQL below.

1a. Add a `manufacturerContactsTable` to `lib/db/src/schema/manufacturers.ts`,
matching the timestamp pattern already used in that file. It is auto-exported by the
barrel, so no index.ts change is needed.

1b. Apply this exact DDL to dev only, via plain SQL:

```sql
CREATE TABLE manufacturer_contacts (
  id serial PRIMARY KEY,
  manufacturer_id integer NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manufacturer_contacts_manufacturer_id_idx
  ON manufacturer_contacts (manufacturer_id);
```

Confirm the schema file matches the applied table (same columns, types, defaults).
Paste the `\d manufacturer_contacts` output from dev. STOP and check in.

## STEP 2: API + codegen

- Extend the manufacturer detail payload in
  `artifacts/api-server/src/routes/manufacturers.ts` to include a `contacts` array,
  and add the create/update/delete handling so contacts can be saved with a
  manufacturer. Follow the existing patterns and the `requireRole("admin")` gate in
  that file.
- Update the API spec and regenerate the client. The definitive codegen check is:
  `pnpm --filter ./lib/api-spec run codegen && git status --short`
  Paste the actual command output. Orval wipes and rebuilds its output folder, so a
  green checkmark alone is not proof. STOP and check in.

## STEP 3: admin UI

In `artifacts/web/src/staff/pages/admin/Manufacturers.tsx`, add a "Vendor contacts"
section below the existing Contact section (the `m-sales-email` field and the Order
delivery block stay exactly as they are). The section is a repeatable list of contact
rows, each with: name, role, email, phone, a remove button, and a way to mark one
contact primary. Include an "Add contact" button.

Approved layout: each contact in its own bordered row, fields grouped so it does not
become a wall of inputs. Match the existing admin styling.

Hands-on walkthrough in dev before calling it done. Use Treasure Garden as the test
vendor (it has three reps). Add three contacts, mark one primary, edit one, remove
one, save, reload, and read the rows back to confirm they persisted. Report exactly
what you saw at each step. STOP and check in.

## APPENDIX: prod DDL (Karen applies separately, plain SQL, not drizzle-kit push)

Identical to the Step 1b DDL. Karen applies this to prod when ready.

## STEP 3 addendum: single primary (approved July 19)

Exactly one contact per vendor may be primary, but a vendor can still have any number
of additional non-primary contacts. Enforce in the UI: clicking "Make primary" on a
contact unsets `is_primary` on all other contacts for that vendor, so two primaries
can never exist. Additional contacts are unaffected and unlimited.

## STEP 4: phone number input mask (vendor edit form only)

Scope: the vendor edit form in `Manufacturers.tsx` only. Not app-wide. Applies to
three fields: the top-of-form Phone, the top-of-form Fax, and each Vendor contact's
Phone field.

Behavior:
- As the user types, keep only digits, cap at 10, and display progressively formatted
  as "(AAA) BBB-CCCC" (e.g. typing 8185551212 shows "(818) 555-1212"). Partial entry
  shows the partial format (e.g. "(818) 555-12").
- Ignore any input beyond 10 digits.
- Store the formatted string on save when 10 digits are present.
- On opening a vendor whose existing Phone/Fax value is exactly 10 digits, display it
  formatted. If an existing value is NOT 10 digits (extension, international, blank),
  leave it exactly as-is. Do not mangle or reformat it.
- Do not add a save-blocking validation gate for incomplete numbers in this step.

Do not touch phone fields anywhere else in the app. A full app-wide phone mask is a
separate future task.

Walkthrough before done: in dev, on a vendor, type raw digits into Phone, Fax, and a
contact Phone and confirm each formats to "(AAA) BBB-CCCC". Confirm typing past 10
digits is ignored. Save, reload, and confirm the formatted values persisted. Report
what you saw. STOP and check in.
