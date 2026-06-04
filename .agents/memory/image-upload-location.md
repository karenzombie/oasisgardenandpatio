---
name: Image upload location
description: Where the user uploads image assets — workspace root folders, not Object Storage.
---

## Rule
When the user says they uploaded images to a folder, check the **workspace root** first (e.g. `ls ./folder_name/`). Do NOT look in Object Storage or `attached_assets/` as the first step.

**Why:** The user always uploads batch image folders by dragging them into the Replit file panel, which places them at the workspace root. Object Storage is only used for admin-uploaded images via the API. `attached_assets/` holds one-off static files (logos, hero images, CSVs).

**How to apply:**
1. `ls ./<folder_name>/` — workspace root check first
2. `ls attached_assets/` — if not found at root
3. Object Storage API — only if specifically told the images are there
