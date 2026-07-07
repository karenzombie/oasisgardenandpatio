# Backup System — Full Build Brief

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, stop and ask Karen before proceeding. Check in at every gate listed below before moving forward.

---

## Overview

Build a complete backup system for Oasis Garden & Patio with two separate backup types:

- **Products Backup** -- backs up all product-related database tables plus all product images from Replit object storage
- **Customer Data Backup** -- backs up all customer, order, and transactional database tables (no images)

Both backups push to the same private GitHub repository (`oasis-db-backups`) but into separate folders. Both are triggered manually from the staff portal. The dashboard shows when each type was last backed up.

This brief covers:

1. A server-side backup API with two endpoints (one per backup type)
2. A Backup page in the staff portal under System with two separate controls
3. A dashboard widget showing last backup timestamps for both types

Do not begin any code until you have read this entire brief and confirmed you understand the check-in gates.

---

## What you need to know before starting

### GitHub backup repo

- Repo name: `oasis-db-backups` (private, already exists)
- GitHub account: `karenzombie`
- A Personal Access Token with repo write access is stored in Replit Secrets as `GITHUB_BACKUP_TOKEN`
- Do not hardcode the token anywhere. Read it only from `process.env.GITHUB_BACKUP_TOKEN`

### Database

- Connection string is available via `process.env.DATABASE_URL`
- Use `pg_dump` to dump the full database for both backup types
- Both backup types run a full `pg_dump` of the entire database -- do not attempt partial table dumps. The SQL file is not the size concern; the images are. A full dump ensures either backup is independently restorable.

### Images

- Product images are stored in Replit object storage
- Paths in the database are stored as `/objects/...` (e.g. `/objects/vendor-imports/foo.png`)
- They are served at runtime via `/api/storage/objects/*`
- The helper is at `artifacts/api-server/src/lib/imageUrl.ts`
- Image metadata (filenames, product associations) lives in the `product_images` table
- Images are only included in the Products Backup, not the Customer Data Backup

### CRITICAL -- Image volume warning

Before writing any image backup code, you must first check:

1. How many files exist in Replit object storage
2. Their total combined size

Report these numbers to Karen before proceeding with the image push implementation. GitHub has a 100MB per-file limit and the API rate limits may make pushing hundreds of individual files very slow. Depending on total image volume, the approach may need to be a single zip archive rather than individual files. Do not assume individual file push will work -- confirm the numbers first and propose an approach.

### What gets backed up

**Products Backup:**
- Full `pg_dump` of the entire PostgreSQL database
- All files in Replit object storage under `/objects/`

**Customer Data Backup:**
- Full `pg_dump` of the entire PostgreSQL database
- No images

### What does NOT get backed up

- Source code (already handled by the main GitHub repo `karenzombie/oasisgardenandpatio`)
- Node modules, build artifacts, or cache files

---

## Section 1 -- Backup storage structure in GitHub

Both backup types live in the same `oasis-db-backups` repo under separate folders:

```
oasis-db-backups/
  latest-products/
    database.sql
    images/
      vendor-imports/
        foo.png
        bar.jpg
      (mirrors /objects/ directory structure)
    backup-manifest.json
  latest-customers/
    database.sql
    backup-manifest.json
```

Each folder is always overwritten on each run of that backup type. This is not a versioned archive -- it is a single current snapshot per type. The goal is recovery.

### backup-manifest.json format (both types)

```json
{
  "backup_type": "products",
  "timestamp": "2026-07-07T14:23:00.000Z",
  "triggered_by": "staff_user_email@example.com",
  "database_dump_size_bytes": 12345678,
  "image_count": 842,
  "image_total_size_bytes": 98765432,
  "status": "success"
}
```

For Customer Data Backup, `image_count` and `image_total_size_bytes` are omitted or set to null.

---

## Section 2 -- Server-side backup endpoints

Create two new API routes:

**POST `/api/admin/backup/products`**
**POST `/api/admin/backup/customers`**

Both routes:
- Require staff authentication (same auth guard as all other `/api/admin/` routes)
- Accept no request body
- Return JSON with the result

### Backup process for both routes (in order)

**Step 1 -- Run pg_dump**

Run `pg_dump` using the `DATABASE_URL` environment variable. Capture full SQL output as a string or buffer.

If `pg_dump` fails for any reason, abort the entire backup, return an error response, and do not push anything to GitHub.

**Step 2 -- Collect object storage files (Products Backup only)**

List every file in Replit object storage under `/objects/`. For each file, read its contents as binary data.

If you cannot enumerate the object storage files, stop and ask Karen how to access the Replit object storage API. Do not guess or assume the API shape.

See the CRITICAL image volume warning in the setup section above -- confirm file count and total size before writing this step.

**Step 3 -- Build backup-manifest.json**

Construct the manifest using data from steps 1 and 2. Use the authenticated staff user's email for `triggered_by`. Use UTC timestamp.

**Step 4 -- Push to GitHub**

Push all files to the appropriate folder in `oasis-db-backups` (`latest-products/` or `latest-customers/`) using the GitHub Contents API (REST).

For each file:
- If the file already exists in the repo, fetch its SHA and overwrite it
- If it does not exist, create it

Push order: images first (Products Backup only), then `database.sql`, then `backup-manifest.json` last. The manifest last means it only lands if everything else succeeded.

**Step 5 -- Record the backup run**

After a successful push, write a row to the `backup_log` table (see Section 3). Record the timestamp, staff email, backup type, and outcome. On failure, still write a row with `status = 'failure'` and the error message.

**Step 6 -- Return response**

Success:
```json
{
  "success": true,
  "backup_type": "products",
  "timestamp": "2026-07-07T14:23:00.000Z",
  "image_count": 842,
  "database_dump_size_bytes": 12345678
}
```

Failure:
```json
{
  "success": false,
  "backup_type": "products",
  "error": "Description of what failed"
}
```

---

## Section 3 -- Backup log table

Create a new database table to store backup run history for both backup types.

Table name: `backup_log`

Columns:
- `id` -- serial primary key
- `backup_type` -- text, not null ("products" or "customers")
- `ran_at` -- timestamptz, not null
- `triggered_by` -- text (staff email)
- `status` -- text, not null ("success" or "failure")
- `error_message` -- text, nullable
- `database_dump_size_bytes` -- bigint, nullable
- `image_count` -- integer, nullable

Add this table via a Drizzle migration. Follow the same migration pattern used elsewhere in the project. Do not use raw SQL.

> Gate 1: Stop here after creating the migration file. Show Karen the migration file before running it. Wait for approval before applying.

---

## Section 4 -- Staff portal Backup page

Location in nav: System > Backups (add "Backups" as a menu item under the existing System section in the staff sidebar nav)

The page has two distinct sections, one per backup type. Display them as two clearly separated cards or panels with a visible label for each.

---

### Panel 1 -- Products Backup

**Last backup status**
- Shows timestamp of last successful Products Backup in plain English (e.g. "Last backed up July 7, 2026 at 2:23 PM")
- If never run: "No backup on record"
- Shows who triggered it and image count

**Run Backup button**
- Label: "Back Up Products Now"
- Color: site green
- On click: confirmation modal
  - Title: "Back up products?"
  - Body: "This will export the full database and all product images to GitHub. Depending on image volume this may take several minutes."
  - Buttons: "Cancel" and "Run Backup"
- After confirming: disable button, show loading state ("Backing up...")
- Calls POST `/api/admin/backup/products`
- On success: refresh status, show green toast ("Products backup complete")
- On failure: show red toast with error message

---

### Panel 2 -- Customer Data Backup

**Last backup status**
- Shows timestamp of last successful Customer Data Backup
- If never run: "No backup on record"
- Shows who triggered it

**Run Backup button**
- Label: "Back Up Customer Data Now"
- Color: site green
- On click: confirmation modal
  - Title: "Back up customer data?"
  - Body: "This will export all customer, order, and transaction data to GitHub."
  - Buttons: "Cancel" and "Run Backup"
- After confirming: disable button, show loading state ("Backing up...")
- Calls POST `/api/admin/backup/customers`
- On success: refresh status, show green toast ("Customer data backup complete")
- On failure: show red toast with error message

---

### Backup history table

Below both panels, show a single combined table of the last 20 backup runs from `backup_log`, sorted by `ran_at DESC`.

Columns: Date/Time | Type | Triggered By | Status | Images | DB Size

- Type column: "Products" or "Customers" label
- Status column: green "Success" badge or red "Failed" badge
- Images column: shows count for Products rows, blank for Customers rows

---

## Section 5 -- Dashboard widget

The existing "Backups" card on the main staff dashboard should display:

- Last Products Backup: timestamp or "Never"
- Last Customer Backup: timestamp or "Never"
- Two buttons stacked: "Back Up Products" and "Back Up Customer Data"
- Each button triggers the same confirmation modal and endpoint as the Backup page

Read both timestamps from `backup_log` (most recent row per `backup_type` where `status = 'success'`).

> Gate 2: Stop after completing the Backup page UI and dashboard widget. Show Karen the full UI before writing any backup execution code. Wait for approval before proceeding.

---

## Section 6 -- Timeout and size considerations

- Set a server-side timeout of at minimum 10 minutes on both backup routes
- The frontend loading state must stay active until the API responds -- do not let the browser time out
- If the Replit environment imposes a shorter max request timeout that cannot be overridden, stop and flag this to Karen before writing the backup execution code. Do not silently truncate or skip files.

---

## Section 7 -- Order of operations

Complete in this exact order:

1. Read this entire brief. Confirm you understand it. List any questions before starting.
2. Create the `backup_log` Drizzle migration. Show Karen. **Wait for Gate 1 approval.**
3. Build the Backup page UI and dashboard widget. Use empty/placeholder state for backup status (no live data yet).
4. Show Karen the UI. **Wait for Gate 2 approval.**
5. Check image file count and total size in object storage. Report to Karen. Confirm image push approach before writing code.
6. Build both backup API endpoints.
7. Wire the frontend to the live endpoints.
8. Test with Karen present: run one of each backup type, confirm files appear in `oasis-db-backups` under the correct folders.
9. Final review.

---

## What must not change

- The existing System menu structure beyond adding the Backups item
- Any existing dashboard cards or layout
- Any existing backup-related code if any exists (check first before adding anything)
- The `oasisgardenandpatio` code repo -- all backup output goes to `oasis-db-backups` only

---

*End of brief*
