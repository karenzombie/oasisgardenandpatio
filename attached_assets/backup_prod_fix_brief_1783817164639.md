# Backup System Fix -- Use Production Database

For: Replit Agent
From: Karen / Claude

---

## What to change

The backup endpoint currently runs `pg_dump` using `DATABASE_URL`, which points to the dev database (heliumdb). This is wrong. Backups must always pull from the production database.

Find the backup API route (POST `/api/admin/backup`) and make one change:

Replace every reference to `DATABASE_URL` in the pg_dump logic with `PROD_DATABASE_URL`.

`PROD_DATABASE_URL` is already available in Replit Secrets. Do not hardcode any value -- read it from `process.env.PROD_DATABASE_URL` exactly the same way the current code reads `process.env.DATABASE_URL`.

Do not change anything else: not the GitHub push logic, not the image backup logic, not the backup_log table, not the UI. Only the database connection used by pg_dump changes.

---

## Check-in required

After making the change, stop and show Karen:

1. The exact line(s) of code you changed
2. Confirmation that no other part of the codebase was modified

Do not test or trigger a backup run. Karen will do that manually.
