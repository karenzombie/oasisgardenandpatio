---
name: API server dev has no hot-reload + codegen breaks web HMR
description: Why route changes don't appear live until the API workflow is restarted, and why running codegen can wedge the web vite HMR state.
---

The `artifacts/api-server` dev workflow runs a build-once-then-start script (`build && start`), NOT a file watcher. Editing any API route/source does NOT take effect in the running server — you MUST restart the `artifacts/api-server: API Server` workflow for changes to go live. A passing typecheck does not mean the running process has the new code.

**Why:** A cart-page feature (`fabricIsStripe`) was fully coded + typechecked, but the user saw nothing because the live API was still the stale build returning the old response shape.

**How to apply:** After any change under `artifacts/api-server/src/**`, restart the API Server workflow before testing. Verify the bundle picked it up with `rg -c "<symbol>" artifacts/api-server/dist/index.mjs`.

Second pitfall: running `pnpm --filter @workspace/api-spec run codegen` rewrites `lib/api-client-react/src/generated/*`; while those files are momentarily absent, the web vite dev server logs `Pre-transform error: Failed to load url .../generated/api.ts` and can wedge HMR ("Failed to reload /src/pages/Cart.tsx"). Fix: restart the `artifacts/web: web` workflow after codegen so vite rebuilds against the regenerated client.

**Verifying session-gated endpoints (e.g. /api/cart) from the shell is unreliable** — the session cookie doesn't round-trip over plain `curl localhost:80` (likely Secure flag). POST returns 200 but a follow-up GET shows an empty cart. Instead verify by running the route's own SQL expression in psql (e.g. `coalesce(f.is_stripe,false)`) against the written rows.
