# Brief B: Staff and Customer Session Collision

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: This brief addresses a security and authentication issue that must be resolved before the site goes live. Do not make any assumptions. If anything is unclear, stop and ask Karen before proceeding. Do not attempt any fixes beyond what is explicitly described here.

---

## Overview

There is a pre-existing session collision between staff logins (admin portal) and customer logins (storefront via Clerk). This was identified and documented during the Brief 7 build but intentionally deferred to its own brief.

This issue must be resolved before launch.

---

## Background -- what the problem is

Staff and customer logins currently share the same browser session cookie. This means that if a browser has both the admin portal and the customer-facing storefront open at the same time, a customer-side Clerk sign-in can silently overwrite the staff session. Once that happens, all admin portal API calls start returning "Forbidden" because the session is now identified as a customer account, not a staff account.

This is not limited to any one admin page. When it occurs, it affects the entire admin portal simultaneously -- confirmed during testing that Users, Shipping, and Wishlists all failed at the same moment.

This is a pre-existing condition in the codebase. It was not introduced by any recent feature work.

---

## What needs to happen

The staff portal session and the customer storefront session must be fully isolated from each other. A customer login on the storefront must have no effect on an active staff session in the admin portal, and vice versa.

### Step 1 -- Investigate and report before touching anything

Before making any changes, investigate the current session architecture and provide Karen with a clear report covering:

- How staff authentication is currently implemented (session cookie name, scope, domain, path).
- How customer authentication via Clerk is currently implemented (cookie name, scope, domain, path).
- Where the collision is occurring -- are they using the same cookie name, the same domain scope, or something else?
- What the recommended fix is, and what files or areas of the codebase it would touch.
- Any risks or side effects to be aware of.

Do not make any code changes during Step 1. Report only.

Check in with Karen after Step 1 before proceeding.

---

### Step 2 -- Implement the fix

After Karen reviews the Step 1 report and approves the proposed approach, implement the fix as described.

The goal is full isolation: a Clerk customer session must not be able to affect or overwrite a staff admin session under any circumstances.

Common approaches include using separate cookie names, separate cookie paths (e.g. `/admin` vs `/`), or separate storage scopes. Use whichever approach is correct for this codebase's architecture. Do not introduce a new authentication library or replace the existing auth approach -- work within what is already in place.

Check in with Karen after Step 2 with instructions for how to test the fix.

---

### Step 3 -- Verify

Provide Karen with a clear test procedure to confirm the fix is working. The test must cover:

- Staff logged in to the admin portal in one browser tab.
- Customer storefront open and signed in via Clerk in a second tab in the same browser.
- Confirm that the staff session in the admin portal remains active and unaffected after the customer Clerk sign-in occurs.
- Confirm that signing out of the customer storefront does not sign out the staff admin session.
- Confirm that signing out of the admin portal does not affect the customer storefront session.

Do not close this brief until Karen has completed and confirmed all three test scenarios.

---

## Scope limits

- Do not change anything about how Clerk works on the customer storefront beyond what is strictly necessary to isolate the sessions.
- Do not replace or restructure the staff authentication system beyond isolating it from the customer session.
- Do not touch any feature code, UI, or data logic. This brief is authentication and session scope only.
- If the investigation in Step 1 reveals the fix is more complex than session scoping (for example, if it requires changes to how Clerk is configured at the account level), stop and report to Karen before proceeding. Do not attempt architectural changes without explicit approval.

---

## Order of operations

1. Investigate and report (Step 1). Check in with Karen. Do not proceed until approved.
2. Implement the fix (Step 2). Check in with Karen with test instructions.
3. Karen runs the verification test (Step 3). Brief is not complete until all three scenarios pass.

---

*End of brief*
