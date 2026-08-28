---
name: Lockfile package-count metric
description: Distinguishes unique package names from top-level pnpm lockfile entries during dependency cleanup.
---

Dependency cleanup checks must distinguish unique package names from top-level entries in the `packages:` section of `pnpm-lock.yaml`; a package resolved at multiple versions counts once per entry. A reference can therefore report 797 unique names but 936 lockfile entries without contradiction.

**Why:** A dependency cleanup brief used the unique-name count while describing the lockfile-entry count, causing a false Step 1 stop even though the before/after entry count was unchanged.

**How to apply:** Compare the same metric in the before and after lockfiles, verify the expected package set and versions independently, and stop only when the applicable before/after condition fails.