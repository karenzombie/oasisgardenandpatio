# Replit Agent Brief: Customer sign-out does not end the Clerk session

**Project:** Oasis Garden and Patio
**Date:** 2026-08-28 (revision of the 2026-08-27 draft, not yet handed to an agent)
**Status:** Pre-existing bug, confirmed by test on 2026-08-27
**Relationship to the ip-address brief:** none. That change touched no source files, and
this bug was reproduced with it reverted.
**Relationship to the dependency cleanup brief:** none. That work completed on
2026-08-28 and changed no source files. It is the current baseline, see "Starting
baseline" below.

---

## Rule that governs this entire brief

**No code change may rest on an assumption.**

Everything below is split into two kinds of statement:

- **Verified.** Read directly out of the files named, with line numbers. Treat as fact.
- **Unverified.** Not established. You may confirm it yourself and report what you
  find. You may **not** implement anything that depends on it while it is unconfirmed.

If confirming something would require changing code or observing a live run you cannot
observe, **stop and report that**. Do not proceed on a best guess and do not work
around it.

---

## The problem

The **My Account** page's sign-out button ends the Express session but never ends the
Clerk session. The header sign-out ends both. That difference is the whole bug.

Two symptoms:

- **Auto sign-in.** After signing out from the account page, clicking Sign In signs
  the user straight back in without asking for credentials.
- **"Something went wrong completing sign-in."** The same sign-out sometimes lands on
  an error screen instead.

---

## Verified facts

All line numbers are against `artifacts/web/src/`.

1. **`components/layout/Navbar.tsx:94`** imports `const { signOut: clerkSignOut } =
   useClerk();`. Its `handleLogout` calls `clerkSignOut()` first, then
   `logoutMutation.mutateAsync()`, then invalidates the current-user query, closes the
   mobile menu, and navigates to `/`.

2. **`pages/Account.tsx:479`** defines `handleLogout`. It calls only
   `logoutMutation.mutateAsync()`, then invalidates the current-user query and
   navigates to `/`. **There is no Clerk sign-out anywhere in it.** This is the bug.

3. **`pages/Account.tsx:20`** imports `useAuth as useClerkAuth` from `@clerk/react`
   and never imports `useClerk`, which is the hook that exposes `signOut`.

4. **`pages/Account.tsx:430`** sets `setTimeout(() => setSyncTimedOut(true), 10_000)`,
   and line 450 renders `"Something went wrong completing sign-in. Please try again."`

5. **`pages/Account.tsx`** has early returns at roughly lines 465 to 477, above
   `handleLogout` at 479. Any hook powering a new sign-out must be called above those
   returns. It will typecheck either way and fail at runtime.

6. **`App.tsx:124`** calls `useClerkSync()`, so it runs on every page.

7. **`lib/useClerkSync.ts:32`** holds its own `clerkSignOut`, used only in the 403
   `account_disabled` branch. That is a deliberate safety path unrelated to this bug.

8. **`lib/useClerkSync.ts`** returns early when `syncedSessionRef.current === sessionId`.
   That ref is set when a sync succeeds and when a local user is already present.

9. **`pages/auth/CustomSignIn.tsx`** contains
   `if (isLoaded && isSignedIn) return <Redirect to="/account" />;`.
   **While a Clerk session is alive, the sign-in page cannot display its form.** It
   redirects to the account page. This is sufficient on its own to produce the
   auto-sign-in symptom.

10. **`pages/auth/CustomSignIn.tsx`** uses `"Incorrect email or password."` as a
    fallback string whenever a sign-in failure carries no Clerk message. It is not
    evidence of a wrong password. Noted here so it is not misread during testing.

---

## Unverified, confirm before relying on it

The 2026-08-27 draft of this brief stated that `useClerkSync` re-provisions the server
session after an account-page sign-out and thereby signs the user back in.

**That mechanism is not established.** Fact 8 shows a guard that may prevent exactly
that re-sync, and fact 9 shows a second, independent path that produces the
auto-sign-in symptom without `useClerkSync` involvement at all. Determining which
actually occurs requires observing a live run, which reading the source cannot settle.

**You do not need to resolve this to do the work.** The required outcome below stands
on facts 1, 2 and 3 alone. If you can confirm or rule out the `useClerkSync` mechanism
without changing code, report what you find and how you established it. If you cannot,
say so. Either way, **do not implement anything that depends on the answer.**

---

## Starting baseline

The dependency cleanup completed on 2026-08-28. It changed seven package versions and
no source files. One of them, `js-cookie` 3.0.5 to 3.0.8, sits inside `@clerk/shared`
and therefore inside Clerk's cookie handling.

Karen verified customer sign in, sign out, refresh while signed in, and staff portal
sign in with 2FA against that baseline on 2026-08-28, and all passed. That is the state
you are starting from.

---

## Required outcome

Both customer sign-out buttons end the Clerk session **and** the Express session, and
behave identically apart from where they navigate afterward.

How you get there is your call. One thing worth weighing: the two handlers drifting
apart is what caused this bug, so a single shared path both buttons call is more
durable than patching the account page and leaving two copies. If you see a better
approach, take it and say why in your report.

---

## Hard constraints

These are correctness and scope requirements, not style preferences.

1. **Clerk must be signed out before the Express session is destroyed.** Verified fact
   1 shows the header sign-out already does it in that order. Reversing the order in
   either handler is out of bounds.

2. **Do not modify dependencies.** No changes to `package.json`, `pnpm-workspace.yaml`
   or `pnpm-lock.yaml`. Do not run `pnpm audit --fix`, do not add or remove packages,
   and do not regenerate the lockfile. Seven override floors were applied on
   2026-08-28 and must survive untouched: js-yaml, postcss, nanoid, js-cookie,
   fast-uri, brace-expansion, dompurify. If any tooling changes those files on its own,
   **stop and report it.** This is a client-side source fix and needs nothing from
   them.

3. **Do not modify `staff/Topbar.tsx`.** Staff auth is a separate system using
   `useStaffLogout`, the `oasis.staff` cookie, and `/api/auth/staff/logout`. Clerk is
   not involved. Out of scope.

4. **Do not modify `lib/useClerkSync.ts`.** Its `clerkSignOut` call for the 403
   `account_disabled` case is a deliberate safety path, unrelated to this bug, and must
   survive unchanged.

5. **Do not modify `App.tsx`, any server route, or the sign-in flow.** That includes
   `pages/auth/CustomSignIn.tsx`. It is connected to the symptom, see fact 9, but it is
   not to be changed under this brief. This is a sign-out fix.

6. **Do not change cart cache behavior.** The customer cart cache is not cleared on
   sign-out and is not user-scoped. This was raised with Karen on 2026-08-27 and she
   confirmed it is working as designed. Do not add cart clearing to any sign-out path.
   Do not call `queryClient.clear()` on the customer side.

7. **Do not change the wishlist cache.** It is already user-scoped via
   `wishlistKeyFor` in `lib/wishlistHold.ts`, documented there as deliberate.

8. **Preserve each button's own behavior.** The header sign-out closes the mobile
   menu; the account page one does not. Both navigate to `/`. Keep those differences.

9. **Do not remove the `useAuth as useClerkAuth` import from `pages/Account.tsx`.** It
   is not the sign-out hook. It drives the redirect gate and the sync timeout logic,
   and removing it will break the page.

---

## Ground rules

1. Work the steps in order. **Stop at the end of each step and report back.** Do not
   continue without a go-ahead.
2. Report actual command output and actual diffs, not summaries.
3. **Do not perform UI or browser testing.** Karen does all UI verification. Say when
   something is ready and what to test.
4. If what you find does not match what this brief states as verified, **stop and
   report the difference**. Do not work around it.
5. Never implement on an assumption. See the rule at the top.

---

## STEP 0: Confirm the starting state

Read `components/layout/Navbar.tsx`, `pages/Account.tsx`, `lib/useClerkSync.ts`,
`App.tsx`, and `pages/auth/CustomSignIn.tsx`, and report:

- The current sign-out handler in each of the two customer components, quoted
- Which `@clerk/react` hooks each of those two files imports
- Confirmation that `useClerkSync` is mounted globally in `App.tsx`
- Whether anything other than sign-out uses `useLogout` or `useClerk` in those files
- Confirmation or correction of each of the ten verified facts above. If any of them
  does not match what you read, **stop and report it before doing anything else.**
- Anything you can establish about the unverified `useClerkSync` mechanism, and how you
  established it. "Could not determine without a live run" is an acceptable answer.

Also run and report:

```bash
git rev-parse --short HEAD
git status --short
```

**Record that commit hash.** Step 3 needs it, because Replit commits automatically
between steps and a plain working-tree diff will be empty by then. Call it `BASE`.
`BASE` is a placeholder for that actual hash, substitute it wherever it appears.

**STOP. Report and wait.**

---

## STEP 1: Implement

Make both customer sign-out buttons meet the required outcome, within the hard
constraints.

State in your report what approach you chose and which files you changed.

Then:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
NODE_ENV=production pnpm --filter @workspace/web run build
git status --short
```

**Do not run `pnpm run build` at the workspace root.** It fails on
`artifacts/mockup-sandbox`, whose `vite.config.ts` throws when `PORT` is unset and
again when `BASE_PATH` is unset. Nothing in this project sets either for a build. That
failure is unrelated and pre-existing.

**Expected:** typecheck clean, both builds pass, and only customer sign-out files
changed. No server route, no `staff/Topbar.tsx`, no `lib/useClerkSync.ts`, no
`App.tsx`, no `pages/auth/CustomSignIn.tsx`, and none of the three dependency files.

**STOP. Report and wait.**

---

## STEP 2: Hand off to Karen

Report that it is ready for UI testing and list what needs checking:

- Sign out from the **My Account** page. Should land on the home page with no error.
- Then click **Sign In** in the header. Should show the sign-in form, not auto-sign-in,
  and not show "Something went wrong completing sign-in."
- Sign out from the **header menu**. Should behave exactly as it does today.
- Sign out from the **mobile menu**. Confirm the menu closes.
- Sign back in normally and confirm the account page loads.
- Confirm the **staff portal** sign-out still works and still lands on `/staff`.
- Confirm the header cart count still works while signed in.

**STOP. Do not proceed until Karen confirms these pass.**

---

## STEP 3: Confirm and close

Using the `BASE` hash recorded in Step 0:

```bash
git log --oneline -5
git diff --stat BASE HEAD
git diff BASE HEAD -- package.json pnpm-workspace.yaml pnpm-lock.yaml
```

Report the full list of files changed across the whole brief, and confirm none of the
out-of-scope files in the hard constraints were touched.

**The third command must return nothing.** Any output means the dependency work was
disturbed. If that happens, **stop and report it** rather than correcting it yourself.

Brief and addendum documents may appear in the file list because Replit commits
automatically between steps. That is expected and is not a failure. Application source
files outside the sign-out fix are.

---

## Footprint summary

**What sign-out is responsible for:** ending the Clerk session, ending the Express
session, clearing the current-user cache, and returning the user to a signed-out view.
The account-page button currently does only the second, third and fourth.

**What is connected to sign-out being correct:**

- `useClerkSync` in `App.tsx`, which bridges Clerk to the Express session on every
  page. Not modified.
- `pages/auth/CustomSignIn.tsx`, whose redirect guard means a live Clerk session sends
  a visitor to the account page instead of showing the sign-in form. Not modified, but
  it is why a Clerk session left alive is visible to the user immediately.
- The current-user query cache, which both handlers invalidate.

**What is NOT touched:** staff authentication and its sign-out, all server routes, the
sign-in flow including `CustomSignIn.tsx`, Clerk configuration, `App.tsx`, the cart
cache (working as designed), the wishlist cache (already user-scoped), checkout,
Authorize.Net, and all three dependency files.

**Known pre-existing and out of scope:**

- `@clerk/*` unmet React peer dependency warnings against React 19.1.0, and an
  `esbuild-plugin-pino` unmet peer warning against esbuild 0.28.1.
- The root `pnpm run build` failing on `artifacts/mockup-sandbox` for missing `PORT`
  and `BASE_PATH`.
- The `trust proxy` rate-limiter question raised in the ip-address brief.
- Five security advisories knowingly accepted on 2026-08-27: three `uuid` High findings
  and two `esbuild` findings. Do not attempt to fix them here.
