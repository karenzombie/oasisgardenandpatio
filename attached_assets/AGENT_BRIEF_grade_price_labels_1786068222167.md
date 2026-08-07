# Agent Brief: label the variant grade-price editor (Phase 1 of 4)

## Scope

One file, presentation only. In the admin Product editor, the per-variant
GRADE PRICES table shows four unlabeled inputs and, for tile-graded products,
shows raw numeric grade keys (for example "35", "36") instead of finish names.
Staff cannot tell which number is which, or what a numeric grade refers to.

Fix both, in `artifacts/web/src/staff/pages/admin/ProductEdit.tsx` only:

1. Add a persistent header row above the variant grade-price rows, so the four
   columns are labeled even when the inputs are filled.
2. In the Grade column, when a value is a numeric finish id (tile-graded
   products), additively show the finish's name as a read-only hint alongside
   the field; the field stays free-text editable. Fabric and other free-text
   grades (AA, A, BB, Awning, Frame Only, and so on) render unchanged.

This is a display change only. It must not change any stored value, the grade
key itself, the database, the API, or any other file.

## What NOT to touch

- Do not change any price value, the grade key stored in the DB, or any save
  logic. The numeric finish id stays the grade key; only the on-screen display
  changes.
- Do not modify any file other than `ProductEdit.tsx`.
- Do not modify the schema, API routes, generated API types, or the storefront.
- Do not "fix", refactor, or clean up anything else you notice in this file.
  If you spot something that looks wrong, note it in your check-in and leave it
  alone.
- Do not touch the addon grade-price editor in this same file (the
  `a.gradePrices.map` block). Only the variant grade-price editor
  (`v.gradePrices.map`) is in scope for this phase.

## Exact anchors (already located, do not go hunting)

- The variant grade-price rows render here:
  `v.gradePrices.map((g, gi) => ( ... ))`
  Each row is a grid: `className="grid grid-cols-[80px_1fr_1fr_1fr_auto] gap-2 items-center"`.
  The four inputs in order are Grade, MSRP, Sale price, Cost, followed by the
  delete control. The only labeling today is input `placeholder` text, which
  disappears once a field has a value.
- The `GRADE PRICES` label and the `Add grade` button sit just above the rows.
- A finishes list is already loaded in this component:
  `const finishesList = useAdminListFinishes({ ... })`. Its data is a list of
  finishes carrying `id` and `name` (`type AdminFinish`). Use this for the
  id-to-name lookup. Do not fetch anything new.

## Step 1 - column headers

Immediately above the `v.gradePrices.map(...)` row list (only when there is at
least one grade row), render one header row using the SAME grid template
`grid-cols-[80px_1fr_1fr_1fr_auto]` so the labels line up over the inputs:

`Grade` | `MSRP` | `Sale` | `Cost` | (leave the last, delete-button, column empty)

Style them as small muted column headers consistent with the rest of the admin
form. The headers must remain visible when the inputs are filled.

Alignment (important): the header row and each data row are SEPARATE grids that
share the template. The last `auto` column holds a delete button in the data
rows but is empty in the header, which will make the `1fr` price columns compute
to different widths and the headers drift out of line with the inputs. To keep
them aligned, give that last column a fixed width in BOTH the header and the
data rows (for example replace `auto` with a fixed size that fits the delete
button), or reserve a matching-width spacer in the header's last cell. Likewise,
if you widen the Grade column to fit longer finish names, apply the identical
template to both the header row and the data rows so all columns stay aligned.

## Step 2 - finish-name hint for tile grades (additive only, nothing forced)

Verified data context (do not re-derive, do not "improve" on this): the grade
field is genuine free text. Its values across the catalog are fabric/frame
grades (A, AA, A+, B, BB, C, D, E, F, Frame Only, and Treasure Garden's
"Awning") plus O.W. Lee tile finish ids that are purely numeric (21 through 63).
Every numeric value currently resolves to a real finish, and only O.W. Lee uses
numeric grades. Therefore this change must NOT force any type, must NOT make any
cell read-only, and must NOT remove free-text editing. It only ADDS a name hint
where a value genuinely resolves.

Hard rules (non-negotiable):

1. Keep the existing editable Grade `<Input>` for EVERY row exactly as today:
   same `value={g.grade}`, same `onChange`. No cell becomes read-only, no
   free-text editing is removed, and nothing about the saved value changes.
2. The finish name is a display-only hint rendered ALONGSIDE the input. Never
   write it into `g.grade` or into any saved field.

Behavior:

- If `/^[0-9]+$/.test(g.grade)` AND it resolves via
  `(finishesList.data ?? []).find((f) => f.id === Number(g.grade))?.name`,
  render that name as a small muted read-only hint next to or below the Grade
  input, so staff see for example "35" with "Urban Pulse" beside it.
- Otherwise (any non-numeric grade such as "Awning", "BB", "A"; or a numeric
  value that does not resolve): render only the editable input as today, with no
  hint. Do not invent a name.
- Optional robustness, preferred if the product's manufacturer id is readily
  available in this component: only show the hint when the resolved finish's
  `manufacturerId` equals the product's manufacturer, to avoid any future
  cross-manufacturer id collision. If the product's manufacturer is not readily
  available here, skip this guard rather than fetching anything new.

Keep column alignment intact (see Step 1). If the hint sits below the input it
only affects the rows that resolve and is fine; if beside the input, make sure
the Grade column has room without pushing the price columns out of line with
their headers.

## Check-in (hard STOP)

After implementing, STOP. Do not proceed to anything else. In your check-in:

1. Paste the raw diff of `ProductEdit.tsx`.
2. Confirm no other file changed (paste `git status --porcelain`).
3. Paste the real output of the typecheck / build command for this package
   (not a summary, the actual output).

Do not attempt to screenshot or verify the UI yourself. Karen tests the UI in
dev after your check-in.

## What Karen will verify in dev (for your awareness, not your task)

- A fabric-graded product (for example San Cristobal Sofa, SKU `695-3S`): the
  grade table now shows Grade / MSRP / Sale / Cost headers that stay visible,
  and the grade column still reads AA / A / B / C / D / Frame Only.
- A tile-topped product (for example a City Series top, variant SKU
  `#E-3658RTD`): the grade column still shows the editable value, now with the
  finish name (for example "Urban Pulse") shown as a hint alongside it.
- A product with a free-text grade (for example a Galtech product using "BB", or
  a Treasure Garden product using "Awning"): the grade cell is unchanged and
  still freely editable, with no hint.
