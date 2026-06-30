---
name: Email test-mode redirect
description: Why all transactional emails may go to one inbox instead of the real recipient
---

# Email test-mode redirect

`sendEmail()` in `artifacts/api-server/src/lib/email.ts` honors an
`EMAIL_TEST_REDIRECT_TO` env var. When set, EVERY outgoing email is routed to
that single address (original recipient preserved in the subject `[→ x]` and a
yellow banner in the body).

**Why:** Resend stays in test mode until a sender domain is verified — in test
mode it returns a 403 ("you can only send testing emails to your own
address") for any recipient other than the Resend account owner. Customer/store
emails (which go to real customer + ADMIN_EMAIL addresses) all failed silently
(fire-and-forget) while vendor emails appeared to work only because that
recipient happened to be the owner address.

**How to apply:** For real delivery, verify a domain at resend.com/domains, set
`RESEND_FROM_EMAIL` to an address on it, and DELETE `EMAIL_TEST_REDIRECT_TO`.
Don't debug "emails going to the wrong address" as a code bug — check this env
var first.
