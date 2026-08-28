# Replit Agent Brief: Clear 11 dependency advisories

**Project:** Oasis Garden and Patio
**Date:** 2026-08-28 (revision of the 2026-08-27 draft, not yet handed to an agent)
**Scope:** 11 of the 16 findings in the Replit security panel. The other 5 are deliberately excluded, see below.

---

## Background

Every package flagged in the scan is at the same version it was before the recent
ip-address work. That change moved one package and added no others, so none of these
findings were caused by it. They were already present and the scanner began reporting
them.

Most of them share a root cause already diagnosed and documented in the ip-address
brief: **overrides declared only in `pnpm-workspace.yaml` do not take effect against
an existing lockfile under pnpm 10.** They apply on a from-scratch resolve and are
silently skipped otherwise, because pnpm records only `package.json` overrides in the
lockfile and uses that record to decide whether to re-resolve.

This is directly visible in the repository. `pnpm-lock.yaml` carries an `overrides:`
block listing exactly four entries, the four from root `package.json`, and none of the
many entries declared in `pnpm-workspace.yaml`.

Four provable contradictions in the repository right now:

| Declared in `pnpm-workspace.yaml` | Actually resolved in `pnpm-lock.yaml` |
|---|---|
| `js-yaml: '>=4.2.0 <5'` | **4.1.1** |
| `js-cookie@<=3.0.5: '>=3.0.7'` | **3.0.5** |
| `uuid@<11.1.1: '>=11.1.1'` | **8.3.2, 9.0.1, 10.0.0** |
| `esbuild: 0.28.1` | **0.18.20, 0.25.12, 0.27.7, 0.28.1** |

Two more sit at their floor for a different reason. `fast-uri` and `brace-expansion`
are declared in root `package.json` as caret ranges, `^3.1.4` and `^5.0.8`. Those
ranges are already satisfied by the installed versions, so pnpm has no reason to
re-resolve them. They are not pins. New advisories now cover the installed versions,
so their floors need raising.

Three have no effective floor at all:

- `nanoid` has no override anywhere.
- `postcss` has an existing `postcss@<8.5.10` entry in `pnpm-workspace.yaml` that does
  not match the installed 8.5.15, so it is a no-op.
- `dompurify` is a **direct dependency of `@workspace/web`**, declared at `^3.4.12`.
  It is not a transitive package. Its caret range is already satisfied, same situation
  as fast-uri and brace-expansion.

---

## Required outcome

These seven packages resolve at or above the patched version, and the change is
visible in `pnpm-lock.yaml`:

| Package | Currently | Minimum patched | Advisories cleared |
|---|---|---|---|
| js-yaml | 4.1.1 | 4.3.1 | 3 |
| postcss | 8.5.15 | 8.5.23 | 2 |
| nanoid | 3.3.12 | 3.3.18 | 2 |
| js-cookie | 3.0.5 | 3.0.7 | 1 |
| fast-uri | 3.1.4 | 3.1.5 | 1 |
| brace-expansion | 5.0.8 | 5.0.9 | 1 |
| dompurify | 3.4.12 | 3.4.13 | 1 |

Patched versions are taken from `pnpm audit` against this repository, not from
memory.

---

## Explicitly out of scope

**Do not attempt to fix `uuid` or `esbuild`.** That covers five findings: three uuid
High and two esbuild (one Moderate, one Low). Karen reviewed the tradeoff on
2026-08-27 and accepted the risk. Leave them.

Reasons, for the record:

- **uuid** has no fix below version 11. The installed 8.3.2, 9.0.1 and 10.0.0 come
  from `exceljs`, `gaxios`, `teeny-request` and `svix`, which sit under Excel export,
  Replit Object Storage (product images and uploaded documents), and Clerk webhooks.
  Forcing a jump from 8 to 11+ crosses three major versions under production paths.
  The advisory itself requires calling uuid v3, v5 or v6 with a `buf` argument, which
  is an unusual call pattern.
- **esbuild** old copies come from `drizzle-kit`, `tsx`, `esbuild-register` and
  `tsconfck`, which sit under database tooling and script running. Both advisories
  affect the **development server only**, not the deployed site. `esbuild` is also a
  direct devDependency of `@workspace/api-server` at `^0.28.1`, which stays as it is.

If a future scan escalates either of these, they get their own brief with their own
measurement. Not this one.

---

## Hard constraints

1. **The lockfile must actually change.** An override that leaves `pnpm-lock.yaml`
   untouched has not been applied, whatever the settings files say. That is the exact
   failure this brief exists to correct. Verify against the lockfile every time.

2. **Do not delete or regenerate `pnpm-lock.yaml`.** Measured against this repository,
   a from-scratch regeneration moves **297 packages**, adds 7 and removes 14,
   including `@clerk/backend` 3.4.4 to 3.16.12, `pg`, `otplib`, `resend`, two major
   `@react-pdf` bumps, and it drops `svix` entirely. None of that is required here.

3. **Keep every bump inside its current major version.** Ranges must be bounded.
   An unbounded floor such as `>=3.3.18` on nanoid resolves to 6.0.1, and `>=11.1.1`
   on uuid resolves to 14.0.2. Both were observed in testing.

4. **Do not touch `uuid` or `esbuild`.** See the out-of-scope section.

5. **Do not modify application source.** This is a dependency change only.

6. **Do not remove existing entries from `pnpm-workspace.yaml`.** Replit's own
   `pnpm audit --fix` writes there. Removing its entries invites churn. Existing
   ranged entries and new blanket entries coexist safely; this was tested under both
   pnpm 10 and pnpm 11.

   **Exception, and it is required:** `pnpm-workspace.yaml` already contains a bare
   `js-yaml` key. YAML does not permit a duplicate key at the same level, so the
   existing `js-yaml` value must be **updated in place**, not joined by a second
   `js-yaml` line. The file must still parse as valid YAML when you are done. The same
   applies to the existing bare `fast-uri` and `brace-expansion` keys. Version-qualified
   entries such as `fast-uri@<=3.1.1` are different keys and stay as they are.

7. **Follow the pattern already established in this repository** by the ip-address
   fix: the effective override lives in root `package.json`, mirrored into
   `pnpm-workspace.yaml` at the same value so it survives a future move to pnpm 11,
   which stops reading `package.json` overrides entirely. Both files, same values.

8. **`package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` must stay in sync and
   be committed together.** `scripts/post-merge.sh` begins with
   `pnpm install --frozen-lockfile` under `set -e`. See the post-merge section below.

---

## Ground rules

1. Work the steps in order. **Stop at the end of each step and report back.** Do not
   continue without a go-ahead.
2. Report actual command output and actual diffs, not summaries.
3. **Do not perform UI or browser testing.** Karen does all UI verification.
4. If observed output does not match what this brief states, **stop and report the
   difference**. Do not attempt a workaround.

---

## STEP 0: Confirm the starting state

Report verbatim:

```bash
pnpm --version
git rev-parse --short HEAD
git status --short
grep -n -A8 '"pnpm"' package.json
grep -nE "^  (js-yaml|postcss|nanoid|js-cookie|fast-uri|brace-expansion|dompurify)@" pnpm-lock.yaml
```

**Expected:** clean working tree; `package.json` shows four overrides
(`brace-expansion`, `fast-uri`, `body-parser`, `ip-address`); the lockfile shows
js-yaml 4.1.1, postcss 8.5.15, nanoid 3.3.12, js-cookie 3.0.5, fast-uri 3.1.4,
brace-expansion 5.0.8, dompurify 3.4.12.

**Record the commit hash.** Step 3 needs it, because Replit commits automatically
between steps and a plain working-tree diff will be empty by then. Call it `BASE`.
`BASE` is a placeholder for that actual hash, substitute it wherever it appears.

**STOP. Report and wait.**

---

## STEP 1: Apply the overrides, lockfile only

Set the seven floors in both `package.json` and `pnpm-workspace.yaml`, per constraints
6 and 7, keeping every bump inside its current major.

Then:

```bash
pnpm install --lockfile-only --ignore-scripts
git diff --stat pnpm-lock.yaml
grep -nE "^  (js-yaml|postcss|nanoid|js-cookie|fast-uri|brace-expansion|dompurify)@" pnpm-lock.yaml
```

### Expected result

This was measured against this repository under pnpm 10.34.5 on 2026-08-28. A control
resolve with no changes at all produced a byte-identical lockfile, so anything that
moves here is attributable to this change and nothing else.

**Exactly seven packages change. Nothing is added. Nothing is removed. The package
count is 797 before and 797 after.**

```
brace-expansion: 5.0.8  -> 5.0.9
dompurify:       3.4.12 -> 3.4.14
fast-uri:        3.1.4  -> 3.1.6
js-cookie:       3.0.5  -> 3.0.8
js-yaml:         4.1.1  -> 4.3.2
nanoid:          3.3.12 -> 3.3.18
postcss:         8.5.15 -> 8.5.26
```

**These target versions are the newest patch available on the measurement date, not
fixed requirements.** New patch releases appear regularly. A result that lands **at or
above** the "Minimum patched" column and **inside the same major version** is correct,
even if the exact number differs from the list above. Note the difference already: the
2026-08-27 measurement produced js-yaml 4.3.1, the 2026-08-28 measurement produced
4.3.2, because a patch was published in between. That is normal and is not a reason to
stop.

**Do stop and report if any of these happen:**

- Any package outside those seven changes version.
- Anything is added or removed, or the total package count is not 797.
- Any of the seven lands below its "Minimum patched" value.
- Any of the seven crosses a major version boundary.
- `uuid` or `esbuild` moves at all.

**STOP. Report the diff and wait.**

---

## STEP 2: Real install, typecheck, build

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run build
NODE_ENV=production pnpm --filter @workspace/web run build
```

**Do not run `pnpm run build` at the workspace root.** It fails on
`artifacts/mockup-sandbox`, whose `vite.config.ts` throws when `PORT` is unset, and
again when `BASE_PATH` is unset. Nothing in this project sets either for a build. That
failure is unrelated and pre-existing.

Then confirm the manifests and the lockfile agree, which is what every future merge
depends on:

```bash
pnpm install --frozen-lockfile
```

**Expected:** it completes without error. If it reports an outdated or mismatched
lockfile, **stop and report**. Do not continue, and do not commit. See the post-merge
section for why this matters.

Report any errors verbatim.

### Then hand off to Karen

Report that it is ready for UI testing and list what needs checking. These are chosen
from where each package actually sits in the app, not a generic smoke test:

- **Product detail pages.** `dompurify` is a direct dependency of `@workspace/web` and
  sanitizes product description HTML through `src/lib/sanitize.ts`, used only by
  `src/pages/Product.tsx`. That file allows a fixed tag and attribute list. Confirm
  descriptions render with their formatting intact and nothing is stripped or mangled.
- **Sign in, sign out, and refresh the page while signed in.** `js-cookie` is a
  dependency of `@clerk/shared`, so this bump sits inside Clerk's cookie handling.
  Two `@clerk/shared` versions are in the tree, 3.47.5 and 4.9.0, reached through
  `@clerk/react`, `@clerk/themes` and `@clerk/express`, so both the storefront and the
  API server side are affected. Confirm sessions still persist across a refresh.
- **Staff portal sign in and 2FA.** Same reason.
- **General site styling on a few pages, desktop and mobile.** `postcss` is in the CSS
  build path under vite, and `nanoid` is reached only through postcss.
- **One admin image upload and confirm the image displays.** Exercises the storage
  path end to end.

**STOP. Report and wait.**

---

## STEP 3: Confirm and close

Using the `BASE` hash recorded in Step 0:

```bash
git log --oneline -5
git diff --stat BASE HEAD
```

**Expected:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`. No source
files. All three must be present. A commit that carries the manifest changes without
the lockfile, or the reverse, is a failure, not a partial success.

Then tell Karen it is ready for a final check and for the Replit security panel to be
re-scanned. **Expect 5 findings to remain**, the three uuid and two esbuild items
listed as out of scope. Those are knowingly accepted, not a failure of this work.

---

## Post-merge dependency, read before committing

`scripts/post-merge.sh` runs on merge and begins with:

```bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
```

and then runs the full dev-to-production catalog sync, including
`cleanupProdOnlyRows.ts`, `cleanupProdOnlyJunctionRows.ts` and the batched catalog
reload across roughly 26 tables.

Because of `set -e`, a `--frozen-lockfile` failure stops the script before any of that
runs. A merge would appear to complete while production data quietly stayed unsynced.
`.replit` allows this hook 180 seconds.

This is why constraint 8 exists and why Step 2 verifies `--frozen-lockfile` before
anything is committed. The three files travel together or the merge path breaks.

---

## Footprint summary

**What this change touches:** resolved versions of six transitive packages and one
direct dependency, and the declaration of those version floors in two settings files.

**Where those seven sit in the app, confirmed against the lockfile:**

| Package | Reached through |
|---|---|
| dompurify | direct dependency of `@workspace/web`, product description sanitizing, `src/lib/sanitize.ts` into `src/pages/Product.tsx` |
| js-cookie | `@clerk/shared` 3.47.5 and 4.9.0, Clerk's cookie handling |
| postcss | `vite`, the CSS build pipeline |
| nanoid | `postcss` only |
| js-yaml | `orval` only, API client codegen |
| fast-uri | `ajv` only, schema validation |
| brace-expansion | `minimatch` 3.1.5, 5.1.9 and 9.0.9, glob matching in build tooling |

**What else this change is connected to:**

- `scripts/post-merge.sh` and its `--frozen-lockfile` gate, covered above.
- `.replit` deployment `postBuild` runs `pnpm store prune` with `CI=true`.
- The `.replit` validation workflows run `pnpm run typecheck` and
  `pnpm --filter @workspace/scripts exec tsx src/checkImageUrls.ts`. Both exercise the
  build toolchain that postcss, nanoid, js-yaml and brace-expansion sit in.
- Root `preinstall` removes `package-lock.json` and `yarn.lock` and refuses non-pnpm
  installs. Step 1 uses `--ignore-scripts` and therefore skips it, which is expected.

**What is NOT touched:** all application source, the database and schema, checkout,
Authorize.Net, Clerk package versions themselves, session handling, `uuid`, `esbuild`,
and every other package in the tree.

**Knowingly accepted, not fixed:** three uuid High findings and two esbuild findings.
Karen's decision on 2026-08-27, on the basis that the version jumps required cross
production paths while both esbuild issues affect only the development server.

**Known pre-existing and out of scope:** `@clerk/*` unmet React peer dependency
warnings against React 19.1.0, plus an `esbuild-plugin-pino` unmet peer warning
against esbuild 0.28.1; the root `pnpm run build` failing on
`artifacts/mockup-sandbox` for missing `PORT` and `BASE_PATH`; the `trust proxy`
rate-limiter question from the ip-address brief; and the customer sign-out bug, which
has its own brief and is unrelated to dependencies.
