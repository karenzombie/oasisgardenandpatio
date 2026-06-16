---
name: No-image placeholder text
description: The exact string to use in every no-image fallback div across the storefront.
---

## Rule

Every place the UI falls back to text when a product (or material, etc.) has no image **must** display exactly:

> **No image available**

## Why

Inconsistent wording ("No image", "Image not available", "no image") appeared across the product grid, PDP, search results, and materials pages. The user noticed and required a single canonical phrase.

## How to apply

- Any time you add or edit a no-image fallback `<div>` in `artifacts/web`, always use `No image available` as the display text — never "No image", "Image not available", or any other variant.
- This applies to seeding scripts too: products loaded without images are fine, but the *UI* placeholder text must always be "No image available".
- The pattern used in existing components:
  ```tsx
  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif text-sm">
    No image available
  </div>
  ```
