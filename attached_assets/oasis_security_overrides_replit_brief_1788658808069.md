# Replit Agent Brief: Fix pnpm Override Consolidation and 22 Dependency Advisories

**Project:** Oasis Garden and Patio
**Date:** September 6, 2026
**Type:** Dependency and configuration change only. No application source code changes.

---

## 1. Read this first

This brief has four steps. **Stop at the end of every step and report back before starting the next one.** Do not chain the steps together. Do not deploy or republish anything at any point.

---

## 2. The problem

Replit's dependency scanner reports 22 advisories: 11 Critical, 7 High, 2 Medium, 2 Low, across orval, browserslist, uuid, fflate, qs and esbuild.

The root cause is a configuration conflict, not a missing patch. This repo defines package overrides in **two** places:

1. `package.json` under the `pnpm.overrides` key, 9 entries.
2. `pnpm-workspace.yaml` under `overrides:`, roughly 100 entries.

On pnpm 10.26.1, which is the version this project runs, `package.json` `pnpm.overrides` does **not merge with** the `pnpm-workspace.yaml` block. It **replaces** it entirely, with no warning printed.

**Evidence in this repo:** the `overrides:` section recorded at the top of `pnpm-lock.yaml` contains exactly 9 entries, and they are exactly the 9 from `package.json`. Not one entry from `pnpm-workspace.yaml` appears. Re-resolving the committed lockfile with pnpm 10.26.1 reproduces it byte for byte, confirming the workspace block has never taken effect.

That is why pins already written for uuid, esbuild, qs and others are not doing anything.

Note also: pnpm 11 reverses this precedence. It ignores the `package.json` `pnpm` field entirely and reads the workspace file. So a future pnpm upgrade would silently swap the live override set from 9 entries to 111. Consolidating into one file removes that hazard permanently.

---

## 3. Scope and full footprint

Three files change. The consequences of those three edits are listed here so nothing is a surprise.

**Direct effects:**

| Effect | Detail |
| --- | --- |
| Active overrides go from 9 to 111 | All 9 currently active entries already exist in `pnpm-workspace.yaml`, so none are lost. Verify this in Step 2. |
| 3 packages collapse to a single version | `esbuild` (0.18.20, 0.25.12, 0.27.7, 0.28.1 becomes 0.28.1 only) and `uuid` (8.3.2, 9.0.1, 10.0.0 becomes 14.0.2 only). |
| 69 unused platform binaries are removed | Android, Windows, macOS, FreeBSD and similar builds of esbuild, rollup, lightningcss and tailwind oxide that this Linux project never loads. Install size drops. |
| `@esbuild-kit/esm-loader` is replaced by `tsx` | An existing alias override, `'@esbuild-kit/esm-loader': npm:tsx@^4.21.0`, activates for the first time. **This package is a dependency of `drizzle-kit`.** See the note below. |
| 4 packages change in the production runtime | `qs`, `uuid`, `fflate`, and `side-channel` (a small qs dependency). Everything else that moves is build tooling that is never shipped. |

**On the drizzle-kit change:** `@esbuild-kit/esm-loader` is what `drizzle-kit@0.31.9` uses to read TypeScript config and schema files. Swapping it for `tsx` has been tested in isolation against `drizzle-kit@0.31.9` with a config and schema matching `lib/db/`. `drizzle-kit generate` succeeded in both cases and produced byte-identical SQL output. It is expected to work, and Step 3 verifies it in this repo.

---

## 4. Explicit non-goals

Do **not** do any of the following. Each is out of scope and would introduce risk this change is designed to avoid.

- **Do not run orval codegen.** Do not run `pnpm --filter @workspace/api-spec run codegen`. The roughly 510 generated files under `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` must remain exactly as they are. Upgrading orval clears all 12 orval advisories on its own. Regenerating is a separate future task and is deliberately excluded here.
- **Do not modify `lib/api-spec/openapi.yaml`** or any application source file.
- **Do not deploy or republish.** This work targets the development workspace only.
- **Do not run any database command.** No `push`, no `push-force`, no migrations.
- **Do not add, remove or reorder any override entry** other than the ones specified in Step 1.
- **Do not do UI testing.** Karen performs all UI verification. Report back instead.

---

## 5. Step 1: The three file edits

### Edit 1 of 3: `package.json` (repository root)

Delete the entire `"pnpm"` block, including the comma that ends the `devDependencies` block before it. These 9 entries all already exist in `pnpm-workspace.yaml`, so nothing is being removed from the project.

Remove this:

```json
  ,
  "pnpm": {
    "overrides": {
      "brace-expansion": ">=5.0.9 <6",
      "fast-uri": ">=3.1.5 <4",
      "body-parser": "^2.3.0",
      "ip-address": ">=10.3.1",
      "js-cookie": ">=3.0.7 <4",
      "js-yaml": ">=4.3.1 <5",
      "nanoid": ">=3.3.18 <4",
      "postcss": ">=8.5.23 <9",
      "dompurify": ">=3.4.13 <4"
    }
  }
```

The resulting file ends after the `devDependencies` block. Keep the existing indentation and keep the trailing newline at the end of the file.

Leave the `preinstall`, `build`, `typecheck:libs` and `typecheck` scripts untouched.

### Edit 2 of 3: `pnpm-workspace.yaml`

Two changes inside the `overrides:` block.

**2a.** Replace the conditional uuid line with an exact pin.

Find:

```yaml
  uuid@<11.1.1: '>=11.1.1'
```

Replace with:

```yaml
  uuid: 14.0.2
```

**2b.** Append these three lines to the very end of the `overrides:` block, after the existing `dompurify` line, at the same two-space indentation:

```yaml
  qs: '>=6.16.0 <7'
  browserslist: '>=4.28.7 <5'
  fflate: '>=0.8.3 <0.9'
```

Change nothing else in this file. Leave `catalog:`, `minimumReleaseAge`, `minimumReleaseAgeExclude`, `onlyBuiltDependencies`, `packages:` and every other override entry exactly as they are.

### Edit 3 of 3: `lib/api-spec/package.json`

Raise the orval floor so the patched version cannot be resolved away.

Find:

```json
    "orval": "^8.5.2"
```

Replace with:

```json
    "orval": "^8.22.0"
```

Keep the caret. Keep the trailing newline at the end of the file. Do not touch the `codegen` script.

**STOP. Report the three edits made, then wait.**

---

## 6. Step 2: Install and verify the lockfile

Run from the repository root:

```
pnpm install
```

Then verify all of the following and report each result explicitly.

**2.1 Override count.** The `overrides:` block near the top of `pnpm-lock.yaml` must now contain **111 entries**, not 9.

**2.2 The original 9 are still active.** Confirm all nine of these names still appear in the lockfile `overrides:` block:

`brace-expansion`, `fast-uri`, `body-parser`, `ip-address`, `js-cookie`, `js-yaml`, `nanoid`, `postcss`, `dompurify`

If any one of these is missing, **stop immediately and report it.** Do not proceed.

**2.3 Resolved versions.** Confirm each of these in `pnpm-lock.yaml`:

| Package | Required | Expected at time of writing |
| --- | --- | --- |
| `orval` | 8.22.0 or higher | 8.28.1 |
| `uuid` | exactly one copy, 14.0.2 | 14.0.2 |
| `esbuild` | exactly one copy, 0.28.1 | 0.28.1 |
| `qs` | 6.16.0 or higher | 6.16.0 |
| `browserslist` | 4.28.7 or higher | 4.28.9 |
| `fflate` | 0.8.3 or higher | 0.8.3 |

For uuid and esbuild, "exactly one copy" is the requirement. There must be no `uuid@8.3.2`, `uuid@9.0.1`, `uuid@10.0.0`, `esbuild@0.18.20`, `esbuild@0.25.12` or `esbuild@0.27.7` anywhere in the lockfile.

**2.4 Expected removals.** These should no longer appear, which is correct and intended:

`@esbuild-kit/esm-loader`, `@esbuild-kit/core-utils`, `source-map@0.6.1`, `source-map-support@0.5.21`, plus the platform-specific binary packages.

**2.5 Generated files untouched.** Confirm that no file under `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/` has been modified. The only changed files at this point should be the three edited in Step 1 plus `pnpm-lock.yaml`.

**STOP. Report all five verification results, then wait.**

---

## 7. Step 3: Typecheck and build

Run these in order from the repository root and report the full outcome of each:

```
pnpm run typecheck
```

```
pnpm run build
```

Then confirm the drizzle-kit toolchain still loads its TypeScript config after the `tsx` swap. This is a read-only check:

```
pnpm --filter @workspace/db exec drizzle-kit --help
```

Do **not** run `push` or `push-force`. Do not connect to the database.

If any of these three commands fails, **stop and report the exact error output.** Do not attempt a fix, do not adjust versions, and do not modify source code to make an error go away. Report and wait.

**STOP. Report all three results, then wait.**

---

## 8. Step 4: Report and hand off

Provide a short summary containing:

1. The list of files changed, with nothing else included.
2. The lockfile override count, before and after.
3. The resolved version of each of the six packages in the table in Step 2.3.
4. Confirmation that the generated API files are untouched.
5. Confirmation that typecheck and build both passed.
6. Anything unexpected, however small.

Then stop. Karen performs UI verification herself. Do not attempt UI testing, screenshots, or browser checks.

---

## 9. What Karen checks in the development preview

For reference only. The agent does not perform these.

1. Site loads, home page and a category page render.
2. Sign in and sign out through Clerk. This exercises the svix and uuid path.
3. Add to cart and view the cart.
4. Admin: view a product, and upload or view a product image. This exercises the Google Cloud Storage and uuid path.
5. Generate or view a PDF, such as an order or quote document. This exercises the `@react-pdf/renderer` and fflate path.
6. Any page with query parameters, such as a filtered or paginated product list. This exercises the qs path.
7. Re-run the Replit dependency scan and confirm the count has gone from 22 to 0.

---

## 10. Rollback

The change is contained in four files: `package.json`, `pnpm-workspace.yaml`, `lib/api-spec/package.json` and `pnpm-lock.yaml`.

To revert, restore all four from git and run `pnpm install`. No database change, no source code change and no deployment is involved, so there is nothing else to undo.

---

## 11. Deployment note

This work applies to the development workspace only. Replit does not push development changes to the live site automatically. Production updates only when Karen chooses to republish. Do not republish as part of this brief.
