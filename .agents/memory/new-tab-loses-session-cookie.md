---
name: New browser tab/window can lose the staff session cookie
description: window.open()/target=_blank to a same-origin API endpoint can 401 even though the user is logged in, because the new top-level browsing context doesn't carry the session cookie in this embedded-preview environment.
---

Any staff feature that does `window.open(...)` or `<a target="_blank">` straight to a same-origin API endpoint (e.g. a PDF-generating route) can fail with "Authentication required" even though the user is actively logged in in the current tab. The app is normally viewed inside an iframe (canvas/workspace preview), and opening a brand-new top-level tab/window creates a different browsing context that does not reliably carry the session cookie set for the embedded context — observed as a `307` redirect followed by `401` on the new tab's request, while the original tab stays authenticated.

**Why:** hit with the Brief 7 wishlist "Print" button (`window.open('/api/admin/wishlists/:id/pdf')`); confirmed the same anti-pattern pre-existed for order PDFs (`OrderDetail.tsx`, `window.open('/api/admin/orders/:id/pdf?copy=...')`) and likely has the same latent risk there, just not yet reported as broken.

**How to apply:** don't open server-rendered file endpoints in a new tab/window for auth-gated content. Instead, render the content as a normal authenticated in-app route/page (same tab, client-side navigation, so it reuses the existing session already loaded in that tab) and trigger `window.print()` from there for anything the user wants a hard copy of. Reserve server-side PDF generation for contexts that don't depend on a live browser session (e.g. an email attachment generated server-side, not fetched by the browser).
