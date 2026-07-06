# Dashboard Overhaul Brief

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, stop and ask Karen before proceeding.

---

## Overview

This brief covers three changes to the staff admin portal:

1. Remove the Notifications item from the left navigation menu entirely.
2. Replace the existing dashboard with a new layout containing dynamic data cards as specified below.
3. Replace the blue color scheme in the staff portal UI with the established site green.

---

## Part 1 -- Remove Notifications from navigation

Remove the "Notifications" item from the left sidebar navigation menu. This includes:

- Remove the nav link and its icon from the sidebar.
- Remove the route it points to (e.g. `/admin/notifications`).
- If there is a notifications page or component, remove it.
- Check whether any other part of the codebase references the notifications route or page and remove those references too.
- The bell icon in the top header bar is a separate element -- do not touch it.

Check in with Karen after completing Part 1 before moving to Part 2.

---

## Part 2 -- Dashboard overhaul

Replace the existing dashboard content area with the new layout described below. The welcome message at the top stays: "Welcome back, [staff name]" with the subline "Here's a quick snapshot of your store."

### Layout

Display cards in a responsive grid. Each card links to its corresponding menu page when clicked (the entire card is clickable). Use `repeat(auto-fit, minmax(200px, 1fr))` for the grid so cards wrap naturally at smaller widths.

### Card design

Each card has:
- A small uppercase section label at the top with a Tabler outline icon to its left.
- A list of labeled rows beneath it, each showing a live count on the right.
- Some cards show a single large number instead of a row list (noted per card below).
- No horizontal dividers inside any card.
- On hover, the card border subtly darkens.

All counts must be live and reflect current database state on every page load. No caching counts on the dashboard.

---

### Card specifications

#### Orders
Links to: `/admin/orders`
Icon: shopping cart

Row counts -- each count is the number of orders currently in that status:
- Pending
- Confirmed
- In production
- Ready for store delivery
- Carrier delivery update
- Out for local delivery
- Delivered
- Completed
- Canceled
- Refunded

Query the orders table grouped by status. The status values must match exactly what is stored in the database. Confirm the exact status strings before writing the query.

---

#### Customers
Links to: `/admin/customers`
Icon: users

Rows:
- Total customers -- count of all customer records
- New customers (48 hrs) -- count of customers whose account was created within the last 48 hours
- New wishlist items to reach out -- count of individual wishlist items where `ok_to_contact = true` and no reach-out email has been sent yet (i.e. the item has not been marked as contacted). Confirm the exact column names for these flags before writing the query.

Total customers appears first.

---

#### Deliveries
Links to: `/admin/deliveries`
Icon: truck

Rows:
- Ready, not scheduled -- orders with status "ready for store delivery" that have no scheduled delivery date assigned
- Local delivery today -- orders with a scheduled local delivery date of today
- Local deliveries this week -- orders with a scheduled local delivery date falling within the current calendar week (Monday through Sunday)
- Carrier delivery updated -- orders with a carrier tracking update that the staff has not yet reviewed/actioned

Confirm the exact column names for scheduled delivery date and carrier update flag before writing the query.

---

#### Vendor orders
Links to: `/admin/vendor-orders`
Icon: building-store

Rows:
- Not sent to vendor -- vendor orders not yet transmitted to the vendor
- Sent to vendor -- vendor orders transmitted but not yet acknowledged
- Acknowledged by vendor -- vendor orders that have been acknowledged

Confirm the exact status values stored in the database before writing the query.

> IMPORTANT: The "mark acknowledged" action on the vendor order detail screen is currently not being recorded in the send and edit history log. This must be fixed as part of this build. Every status change action on the vendor order detail screen -- including mark acknowledged -- must be written to the history log at the time the action is taken, with a timestamp and the staff user who performed it. Do not proceed past the Vendor Orders card without confirming this fix is in place.

---

#### Products
Links to: `/admin/products`
Icon: armchair (or closest available chair/furniture icon)

Single large number: total count of all product records in the system (regardless of active/inactive status).
Label beneath the number: "Total products in system"

---

#### Vendors
Links to: `/admin/vendors`
Icon: tag

Single large number: count of manufacturer records.
Label beneath the number: "Manufacturers"

---

#### Inventory
Links to: `/admin/inventory`
Icon: package

Rows:
- On store display -- sum of on-hand inventory quantity across all products at the "Showroom Floor" location
- In warehouse -- sum of on-hand inventory quantity across all products at the "Main Warehouse (default)" location

Confirm the exact location names as stored in the inventory locations table before writing the query.

---

#### Reports
Links to: `/admin/reports`
Icon: chart-bar

No counts. Display a short muted line of text: "View sales, order history, and store performance."
The entire card is still clickable and routes to the reports page.

---

#### User guide
No link for now (link to be added later).
Icon: book

Display muted italic text: "Coming soon -- step-by-step guidance for using the staff portal."
Card is not clickable until a link is provided.

---

#### Backups
No link.
Icon: database

One row:
- Last backup -- pull the timestamp of the most recent successful backup from wherever backup records are stored. If no backup has been run yet, display "Not yet configured" in muted italic text.

This card is a placeholder. Do not build any new backup functionality as part of this brief. Only display the data if it already exists.

---

## Part 3 -- Staff portal color scheme: replace blue with site green

The current staff portal uses blue as its primary UI color throughout the header bar and left sidebar navigation. Replace all instances of this blue with the established green already in use on the customer-facing storefront.

### Scope

- Top header bar background: change from blue to site green.
- Left sidebar navigation background: change from blue to site green.
- Any text, icons, or active/hover states within the header and sidebar that currently use the blue color should be updated to work correctly against the green background (white text and icons should remain white).
- Active nav item highlight: if currently shown in a lighter blue, replace with an appropriately lighter or contrasting shade of green consistent with the existing site green palette.

### How to find the site green

Do not guess or pick a new green. Find the exact green hex value(s) already in use on the customer-facing storefront. Look in the shared CSS variables, Tailwind config, or theme file for the established green color tokens and use those. If there are multiple green shades defined, use the same shade(s) used for the storefront's primary navigation or header.

### Scope limits

- Do not change any colors inside the main content area (cards, tables, forms, buttons within page content).
- Do not change the color of any status badges or alert colors (green success, red error, amber warning -- these have semantic meaning and must not be touched).
- Only the header bar and sidebar navigation background and their internal text/icon colors are in scope.

### Check-in

After updating the colors, take a screenshot or share a preview link for Karen to review before considering this complete.

---

## Order of operations

1. Complete Part 1 (remove Notifications from nav). Check in with Karen.
2. Build the new dashboard card layout with static placeholder counts to confirm the visual matches the approved mockup. Check in with Karen.
3. Wire each card to its live data query one card at a time, in the order listed above. After each card is wired, check in with Karen before moving to the next.
4. Complete Part 3 (color scheme update). Share a preview for Karen to review.

Do not batch multiple cards together. One card, one check-in.

---

*End of brief*
