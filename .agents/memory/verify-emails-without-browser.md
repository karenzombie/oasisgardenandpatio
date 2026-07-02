---
name: Verify email/template logic without a browser
description: How to prove email rendering + trigger wiring when staff 2FA blocks Playwright and Resend actually sends
---

# Verify email/template logic without a browser

Staff portal login is gated by 2FA with **no dev bypass**, so Playwright cannot
reach admin flows, and `sendEmail()` really sends via Resend (no dry-run). To
verify email content + trigger behavior:

1. Extract the body construction into a **pure exported builder** (e.g.
   `buildCarrierDeliveryUpdateEmail(...) => {subject,title,bodyHtml}`) and have
   the IO wrapper call it. Status emails are already pure via their exported
   `StatusCopy` copy objects.
2. Run a throwaway tsx harness **inside the api-server package**
   (`pnpm --filter @workspace/api-server exec tsx src/__harness.ts`) that imports
   those pure functions directly and asserts substrings. Delete it after.
3. For "fires only on X / never on edit/delete", use a callsite grep of the send
   helper across `artifacts/api-server/src` as the evidence — trigger wiring is
   deterministic, not something to click through.

**Why:** avoids spamming real inboxes and works around the 2FA/no-bypass wall
while still executing the exact production template code (stronger than a code
trace alone).

**How to apply:** any time you touch transactional email copy or its triggers.
Prefer the pure-builder split so future changes stay verifiable.
