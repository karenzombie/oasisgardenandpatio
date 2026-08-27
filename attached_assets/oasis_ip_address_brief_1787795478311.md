# Replit Agent Brief: ip-address CVE fix + override durability

**Project:** Oasis Garden and Patio
**Date:** 2026-08-27
**Ticket:** CVE-2026-69192, ip-address 10.1.0, flagged High

---

## READ THIS FIRST: the one thing that must not happen

**Do not delete, move, or regenerate `pnpm-lock.yaml`.**

This was tested against the real repo. Regenerating the lockfile from scratch changes **297 packages**, adds 7, and removes 14. That includes:

| Package | Current | After a full regen | Why it matters |
|---|---|---|---|
| `@clerk/backend` | 3.4.4 | 3.16.12 | authentication |
| `@clerk/express` | 2.1.12 | 2.1.63 | authentication |
| `@clerk/react` | 6.5.0 | 6.14.7 | authentication UI |
| `svix` | present | **removed** | webhooks |
| `pg` | 8.20.0 | 8.23.0 | database driver |
| `otplib` | 13.4.0 | 13.5.0 | 2FA |
| `resend` | 6.12.2 | 6.22.1 | transactional email |
| `@react-pdf/layout` | 4.6.1 | 5.1.1 | major bump, PDF output |
| `@react-pdf/textkit` | 6.3.0 | 7.0.1 | major bump, PDF output |
| `minimatch` | 9.0.9 | 10.2.6 | major bump |
| `commander` | 14.0.3 | 15.0.0 | major bump |
| plus ~286 others | | | Radix UI, Tailwind, esbuild, rollup, framer-motion |

None of that is required to fix this CVE. The correct fix moves **exactly one package**.

If at any point an install wants to rewrite the whole lockfile, **stop and report** rather than proceeding.

---

## Background: what is actually wrong

`ip-address@10.1.0` is not a direct dependency. Exactly one package pulls it in: `express-rate-limit@8.4.1`, which pins it to exactly `10.1.0` with no version range. Nothing else in the repo references it.

`express-rate-limit` is used in four files only:

- `artifacts/api-server/src/middlewares/rateLimit.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/staffAuth.ts`
- `artifacts/api-server/src/routes/staffRecovery.ts`

`routes/checkout.ts` and `lib/authorizeNet.ts` do not import it. **Checkout and Authorize.Net are outside the footprint of this change.**

### Exploitability: verified not reachable

The CVE is a defect in the library's `Address4` class. `express-rate-limit@8.4.1` imports only `Address6`, and its single call site is gated behind Node's built-in `net.isIPv6()`, which runs before the library is touched. Tested inputs:

| Input | `net.isIPv6()` | Reaches vulnerable code |
|---|---|---|
| `012.0.0.1` | false | no |
| `::ffff:012.0.0.1` | false | no |
| `0::ffff:012.0.0.1` | false | no |
| `::ffff:0300.0.0.1` | false | no |

This is a hygiene fix, not an incident. Scope and pace it accordingly.

### Why the existing override has not taken effect

`pnpm-workspace.yaml` already contains `'ip-address@<=10.1.0': '>=10.1.1'`. Two separate problems, both verified by test:

1. Under pnpm 10, overrides declared in `pnpm-workspace.yaml` are **not recorded in the lockfile** (pnpm issue #10614). Because pnpm compares current overrides against the lockfile's recorded set to decide whether to re-resolve, a workspace-only override never invalidates an existing lockfile. It applies on a from-scratch resolve and is silently skipped otherwise. Confirmed: `pnpm install --lockfile-only` and `--force` on this repo both leave `ip-address` at 10.1.0.
2. The floor `>=10.1.1` is below the patched version anyway. The fix landed in **10.3.1**.

Overrides declared in root `package.json` under `pnpm.overrides` **are** recorded in the lockfile, so pnpm detects changes to them and re-resolves. That is the mechanism this fix uses.

---

## Ground rules

1. Work the steps in order. **Stop at the end of each step and report back.** Do not continue to the next step without a go-ahead.
2. Report actual command output, not a summary of it.
3. Do not run bare `pnpm install` before Step 2.
4. Do not upgrade `express-rate-limit`. It is not necessary and it is not in scope.
5. **Do not perform UI or browser testing.** Karen does all UI verification. Say when something is ready to test and what to test.
6. If observed output does not match the expected output stated in a step, **stop and report the difference**. Do not attempt a workaround.

---

## STEP 0: Report the environment

Run and report verbatim:

```bash
pnpm --version
node --version
head -1 pnpm-lock.yaml
grep -n -A6 '"pnpm"' package.json
grep -n "ip-address" pnpm-workspace.yaml
grep -n "^  ip-address@" pnpm-lock.yaml
```

**Expected:** lockfileVersion `'9.0'`; `package.json` shows three overrides (`brace-expansion`, `fast-uri`, `body-parser`); `pnpm-workspace.yaml` shows the `ip-address@<=10.1.0` line; lockfile shows `ip-address@10.1.0`.

The pnpm major version matters for Step 3. Report it precisely.

**STOP. Report and wait.**

---

## STEP 1: Apply the fix (lockfile only, no install)

Add one line to the existing `pnpm.overrides` block in root `package.json`. Change nothing else in the file.

```json
"pnpm": {
  "overrides": {
    "brace-expansion": "^5.0.8",
    "fast-uri": "^3.1.4",
    "body-parser": "^2.3.0",
    "ip-address": ">=10.3.1"
  }
}
```

Then:

```bash
pnpm install --lockfile-only --ignore-scripts
git diff --stat pnpm-lock.yaml
grep -n "^  ip-address@" pnpm-lock.yaml
```

**Expected result, verified in advance against this exact repo:** exactly one package changes.

```
ip-address: 10.1.0 -> 10.5.0
```

Zero packages added. Zero packages removed. No other version changes.

**If `git diff --stat` shows a large lockfile rewrite, or any package other than `ip-address` changes version, STOP immediately and report.** That means something differs from the tested conditions.

**STOP. Report the diff and wait.**

---

## STEP 2: Real install, typecheck, build

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

Report any errors verbatim.

### Compatibility note

`express-rate-limit@8.4.1` declares `ip-address` as an exact pin of `10.1.0`, so this override deliberately runs it against a newer minor. That combination was A/B tested. The rate limiter's key generation produces byte-identical output on 10.1.0 and 10.5.0 across IPv4, IPv4-mapped IPv6, IPv6 subnet grouping, loopback, and zone-id inputs. No behavior change is expected.

### Then hand off to Karen

Report that it is ready for UI testing and list what needs checking:

- Customer login, including a deliberate wrong password
- Password reset request flow
- Staff login and 2FA prompt
- Admin recovery request
- Resend verification email
- Confirm the rate limit still trips: repeated bad logins should return the "Too many requests" message after 10 attempts in 15 minutes

**STOP. Do not proceed to Step 3 until Karen confirms these pass.**

---

## STEP 3: Make the overrides survive a pnpm upgrade

This step exists because of a real, separate exposure found while investigating.

### The problem

pnpm 11 **stops reading `package.json` `pnpm.overrides` entirely.** It emits this warning and moves on:

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
The following keys were ignored: "pnpm.overrides".
```

Four security pins currently live there. On the day the Replit environment moves to pnpm 11, all four stop applying, silently, with no build failure:

| Pin | Also in `pnpm-workspace.yaml`? | Exposure under pnpm 11 |
|---|---|---|
| `ip-address: >=10.3.1` | only as the too-low `>=10.1.1` | floor drops below the patch |
| `body-parser: ^2.3.0` | **no** | pin disappears completely |
| `fast-uri: ^3.1.4` | only as weaker ranged entries | pin weakens |
| `brace-expansion: ^5.0.8` | only as a weaker ranged entry | pin weakens |

### The fix: mirror, do not move

Add matching blanket entries to the `overrides:` block in `pnpm-workspace.yaml`. **Keep the `package.json` block exactly as it is.**

```yaml
overrides:
  # ... leave every existing entry in place, unchanged ...
  ip-address: '>=10.3.1'
  body-parser: '^2.3.0'
  fast-uri: '^3.1.4'
  brace-expansion: '^5.0.8'
```

**Do not delete the existing ranged entries** such as `'ip-address@<=10.1.0': '>=10.1.1'` or the `fast-uri@<=3.1.1` lines. Those appear to be written by Replit's own `pnpm audit --fix`, which writes to `pnpm-workspace.yaml`. Removing them invites the tooling to re-add them and produces churn.

Coexistence was tested and is safe:

- Blanket and ranged entries for the same package in the same file: both pnpm 10 and pnpm 11 resolve to the correct patched version, no conflict, no error.
- Same key present in both `package.json` and `pnpm-workspace.yaml`: pnpm 10 uses the `package.json` value, pnpm 11 uses the workspace value. Because we are setting them to the **same** value, the result is identical either way.

That is the point of mirroring. It is correct today on pnpm 10 and correct after the upgrade to pnpm 11, with no flag day.

### Verify

```bash
pnpm install --lockfile-only --ignore-scripts
git diff --stat pnpm-lock.yaml
```

**Expected:** no change to the lockfile at all. The mirrored values match what is already resolved, so nothing should move.

If anything moves, stop and report.

**STOP. Report and wait.**

---

## STEP 4: Confirm and close

```bash
grep -n "^  ip-address@" pnpm-lock.yaml
git diff --stat
```

Report the full list of files changed. **Expected: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`. Nothing else.**

No application source file should be modified by any step in this brief.

Then tell Karen it is ready for a final check and for the Replit security panel to be re-scanned.

---

## Footprint summary

**What this change touches:** dependency resolution for one transitive package, plus the declaration location of four existing override pins.

**What depends on `ip-address`:** `express-rate-limit` only. Verified by lockfile inspection.

**What depends on `express-rate-limit`:** seven rate limiters in `middlewares/rateLimit.ts`, consumed by `auth.ts`, `staffAuth.ts`, `staffRecovery.ts`. Covering login, password reset, 2FA, admin recovery request, admin recovery status, admin recovery complete, and resend verification.

**What is NOT touched:** all application source, the database and schema, checkout, Authorize.Net, Clerk, sessions, and every other package in the tree.

**Known pre-existing condition, not caused by this change:** `@clerk/*` reports unmet React peer dependency warnings against React 19.1.0. These appear identically before and after. Out of scope here, worth a separate look.

**Verified separately and deliberately excluded:** the app sets `app.set("trust proxy", 1)` in `artifacts/api-server/src/app.ts`, which means the rate limiter keys off a caller-influenceable header. Whether that is exploitable depends on the Replit proxy setup, which cannot be determined from the repository. This is unverified and is **not** part of this brief. It should be scoped on its own.
