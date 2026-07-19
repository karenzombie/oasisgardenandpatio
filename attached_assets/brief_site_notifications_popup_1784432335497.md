# Brief: Site Notifications — rename, Pop-Ups section, and home-page popup

## What already exists (do not rebuild)
- The `site_notifications` table already has `type` ('popup' or 'banner'), `title`,
  `messageText`, `startDate`, `endDate`, `isActive`, `displayOrder`.
- The public API `/banners/active` already returns all active notifications of both
  types, schedule-filtered.
- The staff page `Banners.tsx` already has full create/edit/delete, including a Type
  dropdown with banner and popup.
- The customer banner (top bar) renders in `Navbar.tsx` by filtering `type === "banner"`
  and shows on every page. This is correct and stays exactly as-is.

The only genuinely new work: one DB column (`style`), a staff-page rename plus a
section split, a Style selector on the pop-up form, and the customer popup component
(which does not exist yet).

## Approved scope (locked, do not change)
- Banner behavior is unchanged: top of every page, all routes. Leave it alone.
- Pop-ups appear ONLY on the home page (`/`). Never on any other route.
- The popup shows immediately on home load. No delay, no timer.
- Dismiss is a single "Got it!" button. No X / close icon.
- Once dismissed, it stays gone for the rest of the browser session, including
  navigating away from home and back.
- The popup uses the REAL logo image (the same asset the header uses), not text.
- New "Style" field: Standard (green) or Alert (amber). Default Standard. Applies to
  pop-ups only (banners are always the green top bar).
- One active per type at a time, by overlapping window: two notifications of the SAME
  type may not both be active with overlapping display windows. Non-overlapping
  schedules are allowed (e.g. A ends today 5:00pm, B starts today 5:01pm is fine).
  A conflicting create, edit, or activate is a hard stop with an error (wording below).

## Do not
- Do not change the banner top-bar behavior or its render logic.
- Do not show pop-ups on any non-home route.
- Do not add any delay/timer before showing the popup.
- Do not touch checkout, cart, payments, or any customer/vendor email.
- Do not hand-edit generated files (`api-zod`, `api-client-react`); regenerate them via
  codegen.
- Do not change the `/admin/banners` URL. Only the visible label and page heading change.
- Do not sync to prod. Dev only. Karen deploys.

---

## Phase 1 — Backend: add the Style field and expose pop-ups

### 1.1 Drizzle schema
File: `lib/db/src/schema/cms.ts`, `siteNotificationsTable`.
- Add column: `style: text("style").notNull().default("standard")`.
- Add a check constraint alongside the existing `type` check, following the exact same
  pattern already used for `site_notifications_type_check`:
  `site_notifications_style_check` → `style in ('standard', 'alert')`.

**STOP.** Paste the schema diff.

### 1.2 Push to the dev database
- First confirm `DATABASE_URL` points at the dev heliumdb, not prod. The drizzle config
  reads `DATABASE_URL`, which is dev, so a normal push is dev-only. Do not set or use
  `PROD_DATABASE_URL` here.
- Apply the schema to dev (drizzle-kit push). Adding a `NOT NULL DEFAULT 'standard'`
  column backfills existing rows automatically.
- If push proposes anything destructive (dropping/recreating the table or a column, or
  any data-loss warning) or prompts unexpectedly, STOP and report. Do not accept it.
  This should be a clean additive change.
- Read-only check: confirm the column exists and every existing row has
  `style = 'standard'`.

**STOP.** Paste the push output and the read-only verification.

### 1.3 OpenAPI spec
File: `lib/api-spec/openapi.yaml`. Add `style` to four schemas. Keep it OPTIONAL
everywhere (do NOT add `style` to any `required` list). The banner routes do not
validate their responses, and leaving `style` optional means any missed path degrades
to "no style" (treated as standard by the UI) instead of a hard failure:
- `Banner`: add `style: { type: string, enum: [standard, alert] }` to properties only.
- `AdminBanner`: add `style: { type: string, enum: [standard, alert] }` to properties
  only.
- `CreateBannerRequest`: add
  `style: { type: string, enum: [standard, alert], default: standard }` (optional).
- `UpdateBannerRequest`: add `style: { type: string, enum: [standard, alert] }`
  (optional).

**STOP.** Paste the spec diffs.

### 1.4 Codegen
- Run: `pnpm --filter ./lib/api-spec run codegen && git status --short`
- Paste the full output including the list of regenerated files. Do not proceed on a
  green check with no file list.

**STOP.**

### 1.5 API routes
- `adminBanners.ts`: add `style` in three spots — `bannerToPayload` (`style: row.style`),
  the create `.values` (`style: parsed.data.style ?? "standard"`), and the update `.set`
  (`style: body.data.style`, guarded the same way `displayOrder` is if the field is
  optional on update).
- `banners.ts` (public `/banners/active`): add `style: siteNotificationsTable.style` to
  the select, and include `style` on each returned object.

Both routes return via `res.json(...)` with no response-schema validation, so these
additions cannot break existing endpoints. Complete this step before any UI testing so
the payloads carry `style`.

**STOP.** Paste the diffs and the api-server typecheck output.

### 1.6 One-active-per-type guard (overlap check)
Enforce, server-side in `adminBanners.ts`, that no two notifications of the SAME `type`
are active with overlapping display windows. This is authoritative; do not rely on the
UI alone.

Overlap rule (treat a null start as "beginning of time" and a null end as "forever"):
- Window of a row = `[startDate, endDate)`; null start = -infinity, null end = +infinity.
- Two windows overlap when `aStart < bEnd` AND `bStart < aEnd`. Strict `<` means
  touching edges do NOT overlap (A ending 5:00pm and B starting 5:00pm or 5:01pm is
  allowed).

Write one helper: given a candidate `{ type, startDate, endDate, excludeId? }`, query for
any row where `type = candidate.type`, `isActive = true`, `id <> excludeId` (when
provided), and the windows overlap. If one exists, it is a conflict.

Apply the check in three places, and on conflict return HTTP 409 with
`{ error: "<message below>" }` (do not write the change):
- Create: when the new row would be active (`isActive` true), check with no excludeId.
- Update: load the row's current `isActive` first; if it is (and stays) active, check
  with the NEW type/dates, excluding its own id. (The update endpoint does not change
  `isActive`, so use the row's current value.)
- Set-active (the toggle): when turning a row ON, check its type/dates against other
  active rows, excluding its own id. Turning a row OFF never conflicts.

Error message wording (use the one matching the row's type):
- Pop-up: `Only one pop-up can be live at a time, and this one's active dates overlap a
  pop-up that's already active. Turn the other one off, or give this pop-up start and end
  dates that don't overlap it.`
- Banner: `Only one banner can be live at a time, and this one's active dates overlap a
  banner that's already active. Turn the other one off, or give this banner start and end
  dates that don't overlap it.`

The existing UI already surfaces the server error text (the dialog shows it, the toggle
shows a toast). For a cleaner message without an HTTP prefix, have those two spots read
`(err as ApiError).data?.error` first, falling back to `err.message`.

**STOP.** Paste the guard diff and the typecheck.

---

## Phase 2 — Staff UI: rename, split into sections, add Style

- `nav.ts`: rename the label "Banners" to "Site Notifications" (the `Site` heading item,
  around line 75). Keep the path `/admin/banners`.
- `Banners.tsx`: change the page heading from "Site Banners" to "Site Notifications".
- Split the single list into two sections, each its own card with its own heading and
  its own Add button:
  - "Banners" section: rows where `type === "banner"`. Columns: Title, Schedule, Order,
    Status, Actions. The Add button ("Add banner") opens the form preset to
    `type = banner`.
  - "Pop-Ups" section: rows where `type === "popup"`. Columns: Title, Style, Schedule,
    Status, Actions. The Add button ("Add pop-up") opens the form preset to
    `type = popup`.
- Each section renders its own empty state when it has no rows (the current single
  "No banners yet" message must not be the only one; the Pop-Ups section needs its own,
  for example "No pop-ups yet").
- `BannerDialog`: accept the preset type from whichever Add button opened it, and hide
  the Type dropdown (type is now determined by the section, both for new and edit).
  - Show the Style selector whenever the dialog's current type is `popup` — this covers
    both creating a new pop-up AND editing an existing pop-up row. Hide Display order
    for pop-ups.
  - When the type is `banner` (new or edit): hide the Style selector, keep Display order.
- Style selector UI: two selectable options with a color swatch each — Standard (green
  `#5C8A72`, the primary) and Alert (amber `#C77E1E`). Persist `style` on create/update.
- Defensive default: anywhere the UI reads `style` (the Pop-Ups table Style column, the
  edit form), treat a missing/undefined value as `"standard"`, since `style` is optional
  in the API types.
- Keep all existing fields, validation, and the schedule (Starts/Ends) as they are.
  Match the approved mockups.

**STOP.** Dev walkthrough: create one Standard pop-up and one Alert pop-up; confirm each
saves with the right `style`, shows in the Pop-Ups section with the Style column, and
that existing banners still show and edit correctly in the Banners section. Edit the
Alert pop-up and confirm the Style selector shows its current value. Then test the guard:
with one active pop-up in place, try to create a second active pop-up whose dates overlap
it and confirm the worded error blocks it; then create a second pop-up scheduled to start
after the first one ends and confirm it IS allowed; confirm the same one-active guard
works for banners. Paste what you saw plus a read-only check of the two new rows' `style`
values.

---

## Phase 3 — Customer popup (home page only)

- New component (for example `HomePopup.tsx`), mounted ONLY inside
  `artifacts/web/src/pages/Home.tsx`. Do not mount it in any shared layout or in
  `Navbar.tsx`; mounting it in Home is what keeps it home-only.
- Data: reuse the existing active-notifications query (`useListActiveBanners`), filter
  to `type === "popup"`. If more than one is active, show the MOST RECENTLY CREATED one
  (highest `id`), so a fresh urgent notice supersedes an older one. If there is none,
  render nothing. Treat a missing `style` as `"standard"`.
- Show immediately on mount. No `setTimeout` or delay of any kind.
- Once-per-session dismissal: on "Got it!", write a `sessionStorage` key
  `oasis_popup_dismissed_<id>` and hide the popup. On mount, if that key is already set
  for the current popup's id, do not show it. Keying on the id means a brand-new popup
  (a different id) will still show, while a dismissed one stays hidden for the whole
  session, including leaving home and returning. (`sessionStorage` naturally clears when
  the tab/session ends, which is the intended per-session behavior.)
- UI (match the approved mockup):
  - A dark scrim overlay behind a centered card.
  - Header band colored by style: green `#5C8A72` for `standard`, amber `#C77E1E` for
    `alert`. The "Got it!" button matches the header color.
  - Logo: import the same asset the header uses (`import logoImg from "@/assets/logo.png"`)
    and render it as an `<img>` in the header band. Do not use a text wordmark.
  - Title = the notification `title`, styled with the `font-bodoni` utility class (the
    same Libre Bodoni display face the hero headline uses). Note: the Tailwind
    `font-serif` class is NOT Bodoni in this theme (it maps to Inter Tight), so do not
    use `font-serif` for the title. Body = `messageText` in the default body font
    (Inter Tight).
  - A single full-width "Got it!" button. No X or corner close.
  - Basic accessibility: `role="dialog"`, `aria-modal="true"`, label the dialog by its
    title, and focus the "Got it!" button on open.
- Use the brand's existing colors/fonts/radius (warm white card, small radius).

**STOP.** Dev walkthrough:
1. Create an active Standard pop-up, load the home page → it appears immediately, green.
   Click "Got it!" → it disappears. Reload home, and navigate away and back to home →
   it stays gone.
2. Switch that pop-up to Alert → the header shows amber.
3. Confirm it does NOT appear on any non-home page (for example Products).
4. With no active pop-up, the home page loads normally with nothing shown.

Paste what you saw for each of the four.

---

## Note
This is customer-facing site UI. It does not touch checkout, cart, payments, or any
email path, and it leaves the banner top-bar behavior unchanged.

---

## Pre-flight review (verified against the code)
- Verified the `site_notifications` schema, the public `/banners/active` route, the
  admin `Banners.tsx` form (Type dropdown already present), and the `Navbar.tsx` banner
  filter. Only the customer popup render is genuinely missing.
- `drizzle-kit push` reads `DATABASE_URL` (dev) only; it does not touch prod.
- The banner API routes return with `res.json(...)` and do NOT validate responses, so
  `style` is kept optional to avoid any hard failure from a missed spot.
- The public API orders by `id asc`; "take the first" would show the OLDEST popup, so
  the component explicitly selects the highest `id` (most recent) instead.
- The hero/display font is the `font-bodoni` utility (Libre Bodoni). The `font-serif`
  Tailwind class maps to Inter Tight in this theme, so the brief avoids it for the title.
- Home is the `/` route (`Home.tsx`), already using api-client-react hooks and asset
  imports, so it is a clean, correct mount point that guarantees home-only pop-ups.
- The one-active-per-type guard is enforced server-side at create, update, and activate,
  by window overlap (so non-overlapping schedules are still allowed). `ApiError.message`
  is built from the server's `error` field, so the worded 409 already reaches the dialog
  and the toggle toast.
- This work does not touch checkout, cart, payments, or any email path.
