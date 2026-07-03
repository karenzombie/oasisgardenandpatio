---
name: Guest cart session persistence
description: Every route that can be the FIRST guest interaction to create/write a cart must force session.save(), or the cart is silently orphaned.
---

Express session is `saveUninitialized: false`, so no `Set-Cookie` is sent until something explicitly persists the session. Guest carts are keyed by `req.session.id`. There's a helper (`ensureSessionPersisted` in `cart.ts`) that sets a `guestCart` marker and calls `session.save()` to force the cookie out on first guest interaction.

**Why:** `POST /cart/items` (the route that actually creates a guest's cart) was missing this call while `PATCH`/`DELETE` on cart items had it. Result: adding the first item to a cart wrote a row keyed by an ephemeral session id that was never sent to the browser; the next request got a brand-new session id, so the cart appeared permanently empty (and checkout failed with "Cart is empty" or silently never created an order). This exactly reproduces "customer says they placed an order but it never shows up in staff Orders/Dashboard" — the order was genuinely never created, not a UI staleness issue.

**How to apply:** Any new/edited cart (or similarly session-keyed guest resource) mutation route must call `ensureSessionPersisted(req)` before touching the DB, especially the route that can be the very first write. To diagnose this class of bug: reproduce with `curl -c cookiejar` through the real HTTPS proxy domain (not `localhost:80` — plain HTTP silently drops `Secure` cookies and gives a false negative) and check whether `Set-Cookie` appears on the very first mutating request.
