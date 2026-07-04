---
name: Staff/customer session cookie collision
description: Staff (email/password+2FA) and customer (Clerk) logins share one express-session cookie; signing into one evicts the other mid-session.
---

Staff sessions and customer sessions both ride the same `oasis.sid` express-session cookie (same name/path). The customer `/api/auth/clerk-sync` route calls `regenerateSession()` and reassigns `req.session.userId` to the customer's id. If a staff member is logged into the admin portal and the same browser also has (or newly establishes) a Clerk customer sign-in — e.g. testing storefront + staff portal in the same browser/canvas iframe — the clerk-sync silently swaps the session over to the customer account. Every subsequent admin API call then 403s ("Forbidden", not 401) because the session's role is now "customer", even though nothing about the admin feature itself is broken.

**Why:** discovered while staff was reviewing an admin feature and got "failed to load" after previously working fine — root cause was a concurrent customer-side Clerk sign-in evicting the staff session, not a bug in the feature being reviewed. Confirmed by seeing multiple unrelated admin endpoints (users, shipping, wishlists) all start 403'ing at the same instant.

**How to apply:** If a staff/admin page suddenly starts returning 403 (not 401) mid-session with no code change to that page, suspect this collision first — check whether the same browser also has an active customer/Clerk session. Workaround for testing: use separate browser profiles/incognito for staff vs. customer sessions. Real fix (not yet done as of this note) would need staff and customer sessions on distinct cookies — this is security/session logic and must not be touched without explicit user sign-off; flagged as a pre-launch follow-up, not fixed inline.
