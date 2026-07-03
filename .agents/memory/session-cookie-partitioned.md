---
name: Session cookie must be Partitioned in prod too
description: Why the oasis.sid SameSite=None cookie needs the Partitioned attribute in production, not just dev.
---

The `oasis.sid` session cookie is `SameSite=None; Secure`. It MUST also carry
`Partitioned` in **every** environment, including published production — not
just the dev/preview iframe.

**Why:** Modern Chrome's third-party-cookie phase-out treats a `SameSite=None`
cookie WITHOUT `Partitioned` as a legacy third-party cookie and refuses to
store/resend it. Symptom: login POST succeeds server-side (session row written
with the pending user), but the very next `GET .../state` (or `/auth/me`)
arrives with no cookie and returns 401 → the screen "blinks" back to the login
page. This hit BOTH staff (Express `oasis.sid`) and customers (Clerk sign-in
also establishes an `oasis.sid` session via clerk-sync), so a cookie-level
break looks like "all logins are down."

**History / do not repeat:** A commit once gated the `Partitioned` patch to
`NODE_ENV !== "production"` on the theory that Partitioned cookies were being
evicted more aggressively in prod. That was wrong and took prod cookies back to
plain `SameSite=None`, which Chrome dropped entirely — a full prod login
outage. Apply `Partitioned` everywhere.

**How to apply:** The attribute is added by a `res.writeHead` patch in
`artifacts/api-server/src/app.ts` that appends `; Partitioned` to any
`SameSite=None; Secure` Set-Cookie. Keep it ungated (runs in all envs). Verify
in prod with `curl -sS -D - -o /dev/null https://<domain>/api/cart | grep -i set-cookie`
— the `oasis.sid` line must include `Partitioned`. Note: curl ignores SameSite
rules, so a curl round-trip working does NOT prove the browser will accept the
cookie; the attribute must be present.
