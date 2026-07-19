# Brief: Route store business notifications to sales@ only

## Goal
Two staff-facing business notifications currently send to the `ADMIN_EMAIL`
environment variable, which is reaching all staff (their personal inboxes). Both must
go ONLY to sales@oasisgardenandpatio.com. The online@ archive BCC that the mail
wrapper already adds stays exactly as-is.

The two notifications:
1. New online order: `sendStoreNewOrderNotification` in
   `artifacts/api-server/src/lib/orderConfirmationEmail.ts`.
2. Cushion order admin alert: the `sendAdminAlertEmail` call in
   `artifacts/api-server/src/routes/cushions.ts`.

## Do not
- Do not modify any customer-facing or vendor-facing email in any way (subject, body,
  recipient, or send logic). This change touches ONLY the two staff business
  notifications named above. Specifically:
  - In `cushions.ts`, the cushion CUSTOMER confirmation email sits directly above the
    admin alert block. Leave it completely untouched. Only the admin alert changes.
  - In `email.ts`, only ADD the new constant. Do not alter any existing email function
    (customer order confirmation, vendor order emails, status emails, etc.).
- Do not touch any payment or order-writing logic. This is an email-recipient change
  only. Nothing in `checkout.ts` order/payment flow changes.
- Do not change `ADMIN_EMAIL` itself, and do not touch its use in `seedAdmin.ts`. That
  is the admin login seed and must stay on `ADMIN_EMAIL`.
- Do not change the online@ archive BCC (`ARCHIVE_BCC` in `email.ts`).
- Do not sync to prod. Dev only. Karen deploys.

## The only three edits allowed
1. Add one constant in `email.ts`.
2. Change the recipient of `sendStoreNewOrderNotification`.
3. Change the recipient of the cushion admin alert in `cushions.ts`.
Nothing else in any file should change.

---

## Step 1: Add the hardcoded recipient constant

File: `artifacts/api-server/src/lib/email.ts`.

Directly below the existing line:

```ts
const ARCHIVE_BCC = "online@oasisgardenandpatio.com";
```

add:

```ts
export const STORE_NOTIFICATION_EMAIL = "sales@oasisgardenandpatio.com";
```

This mirrors the existing hardcoded-constant pattern.

---

## Step 2: Repoint the new-order notification

File: `artifacts/api-server/src/lib/orderConfirmationEmail.ts`, function
`sendStoreNewOrderNotification`.

- Add `STORE_NOTIFICATION_EMAIL` to the EXISTING import from `./email`. That line is
  currently `import { sendEmail, getSiteBaseUrl } from "./email";` and becomes
  `import { sendEmail, getSiteBaseUrl, STORE_NOTIFICATION_EMAIL } from "./email";`.
- Remove the `ADMIN_EMAIL` lookup and its skip guard at the top of the function:

```ts
  const adminEmail = process.env["ADMIN_EMAIL"];
  if (!adminEmail) {
    logger.warn(
      { orderNumber },
      "ADMIN_EMAIL not set; skipping store new-order notification",
    );
    return;
  }
```

- In the `sendEmail({ ... })` call, change `to: adminEmail` to
  `to: STORE_NOTIFICATION_EMAIL`.
- In the success log line, change `to: adminEmail` to `to: STORE_NOTIFICATION_EMAIL`.

Everything else in the function (body, items table, staff portal link) is unchanged.

---

## Step 3: Repoint the cushion-order admin alert

File: `artifacts/api-server/src/routes/cushions.ts`, the cushion admin alert block.

Current shape:

```ts
    const adminEmail = process.env["ADMIN_EMAIL"];
    if (adminEmail) {
      const baseUrl = ...;
      void sendAdminAlertEmail({
        to: adminEmail,
        ...
      }).catch(...);
    }
```

- Add a NEW import line to `cushions.ts`:
  `import { STORE_NOTIFICATION_EMAIL } from "../lib/email";`. Note: `cushions.ts` does
  NOT currently import from `../lib/email` (it imports `sendAdminAlertEmail` from
  `../lib/cushionEmail`, a different module). This must be its own new import line.
- Remove the `ADMIN_EMAIL` lookup and the `if (adminEmail)` gate so the alert always
  fires. Keep the `baseUrl` computation and the rest of the payload as-is. The three
  `adminEmail` references in this file (the lookup, the `if` gate, and `to: adminEmail`)
  are all inside this one block; after this edit `adminEmail` should not appear in
  `cushions.ts` at all.
- Change `to: adminEmail` to `to: STORE_NOTIFICATION_EMAIL`.

**STOP.** Paste the diffs for all three files and wait for confirmation.

---

## Step 4: Verify

1. Run:

```
grep -rn "ADMIN_EMAIL" artifacts/api-server/src
```

Expected: `ADMIN_EMAIL` now appears ONLY in `seedAdmin.ts`. It must no longer appear
in `orderConfirmationEmail.ts` or `cushions.ts`.

2. Confirm both notifications now send `to: STORE_NOTIFICATION_EMAIL`.

3. Run the typecheck/build for the api-server and paste the output.

**STOP.** Paste the grep result and the build output.

---

## Note on real-world proof
This change alters only the recipient of two emails. It does not touch order placement
or payment, so it cannot affect Authorize.net or the checkout flow. The notifications
are already fire-and-forget (`.catch(() => {})`), so even a mail failure never blocks
an order.

Definitive behavioral proof comes on the next real prod order: the store notification
lands in sales@oasisgardenandpatio.com and no staff personal inbox receives it. In dev,
all mail is redirected by `EMAIL_TEST_REDIRECT_TO`, and the redirect banner and subject
prefix will show the intended recipient as sales@oasisgardenandpatio.com, which is a
safe way to confirm the recipient without a live order.

---

## Pre-flight review (verified against the code, since this ships without a dev test)
- These two are the ONLY staff business notifications. `ADMIN_EMAIL` is used in exactly
  three places: these two notifications plus `seedAdmin.ts` (the admin login seed,
  which stays). There is no code path that loops over staff users to email them.
- Both notifications send through `sendEmail`, which routes through `sendViaResend` and
  adds the online@ archive BCC automatically. So after this change each goes to sales@
  with the online@ BCC, exactly as required. The BCC code is not touched.
- `sendStoreNewOrderNotification` fires from one place only (checkout). The cushion
  alert fires from one place only (`cushions.ts`). No other call sites.
- Customer and vendor emails are untouched. The cushion CUSTOMER confirmation sits just
  above the admin alert in `cushions.ts`; the brief calls it out as off-limits.
- Removing the `ADMIN_EMAIL` guard is intentional and safe: previously an unset
  `ADMIN_EMAIL` silently skipped the notification; now it always goes to the hardcoded
  sales@. That is strictly better (guaranteed delivery), and sales@ is always valid.
- No circular-import or type risk: `email.ts` imports nothing from these callers, and
  `STORE_NOTIFICATION_EMAIL` is a plain string matching each `to:` parameter type.
