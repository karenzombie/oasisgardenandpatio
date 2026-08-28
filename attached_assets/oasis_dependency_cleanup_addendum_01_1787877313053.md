# Addendum 01 to: Replit Agent Brief, Clear 11 dependency advisories

**Project:** Oasis Garden and Patio
**Date:** 2026-08-28
**Applies to:** `oasis_dependency_cleanup_brief_v2.md`
**Status of that brief:** still in force. This addendum corrects one stated number in
Step 1 and clears Step 1 to close. Nothing else changes.

---

## What this corrects

Step 1 of the brief states:

> **Exactly seven packages change. Nothing is added. Nothing is removed. The package
> count is 797 before and 797 after.**

**The number 797 is wrong.** It was a count of unique package *names*, taken from the
measurement script, not a count of entries in the lockfile. The two are different
metrics and the brief quoted the wrong one.

The correct figure, recounted against the same before and after lockfiles used for the
original measurement:

**936 entries before, 936 entries after.**

That is the count of top-level entries in the `packages:` section of `pnpm-lock.yaml`,
where a package present at three versions counts as three entries.

The agent's reported `baseline_package_entries=936` and `current_package_entries=936`
are correct and match the reference measurement exactly.

---

## Effect on the Step 1 stop condition

Replace this line in the Step 1 stop list:

> - Anything is added or removed, or the total package count is not 797.

with:

> - Anything is added or removed, or the total package entry count changes between the
>   before and after lockfile. The reference measurement is 936 before and 936 after.

The condition that matters is that the count does **not change**. An equal count before
and after satisfies it.

---

## Step 1 result

Step 1 is **complete and passing**. On the reported output:

- All seven target packages resolved to the expected versions: brace-expansion 5.0.9,
  dompurify 3.4.14, fast-uri 3.1.6, js-cookie 3.0.8, js-yaml 4.3.2, nanoid 3.3.18,
  postcss 8.5.26.
- No `uuid` or `esbuild` change in the diff.
- Package entry count unchanged at 936.
- Diff confined to `pnpm-lock.yaml`, 40 insertions and 36 deletions.

This matches the reference measurement, which was taken under pnpm 10.34.5, even though
this run used pnpm 10.26.1.

**The agent was correct to stop.** The brief told it to halt on a mismatch and it did,
without attempting a workaround. That is the required behavior and it worked.

---

## Instruction

**Proceed to Step 2 of the brief as written.** All Step 2 requirements stand unchanged,
including the `pnpm install --frozen-lockfile` verification before anything is
committed, and the instruction not to run `pnpm run build` at the workspace root.

Continue to stop at the end of Step 2 and report.

---

## One note for Step 3

An untracked file `attached_assets/oasis_dependency_cleanup_brief_v2_*.md` was reported
at Step 0. That is the brief document itself. Because Replit commits automatically
between steps, it may appear in the Step 3 `git diff --stat BASE HEAD` alongside
`package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`. This addendum file may
appear there as well.

Those documents appearing in the diff is expected and is not a Step 3 failure. The
Step 3 condition is that **no application source files** appear, and that all three of
`package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` do.
