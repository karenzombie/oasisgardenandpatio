# AGENT BRIEF: Link Preview (Open Graph) Brand Card

## Objective
Give the site a proper link preview so that when any oasisgardenandpatio.com link is shared (iMessage, Messages, Facebook, Slack, WhatsApp, etc.), it shows a branded card (a patio hero image with the Oasis logo) instead of just the bare name and URL.

This is a single site wide brand card. It is the same card for the homepage and for every product page. Per product previews were investigated and ruled out because this site is a static SPA with no build time data access and a catch all rewrite, so per product cards are not achievable without live server infrastructure, which was declined. This brief delivers the one brand card only.

## Provided asset
A finished card image is provided with this brief: `og-image.jpg` (1200 x 630, about 228 KB). Use this exact file. Do not regenerate, recrop, recolor, or recompress it.

## Scope boundary (read carefully)
This change is additive and confined entirely to `artifacts/web`. It adds one static image file and a small block of meta tags to one HTML file.

Do NOT do any of the following:
- Do not modify any file in `artifacts/api-server`.
- Do not modify routing, rewrites, or any `.replit-artifact/artifact.toml`.
- Do not touch `artifacts/web/src/hooks/use-seo.ts` (it is an unused client side hook and is unrelated).
- Do not touch the favicon, `apple-touch-icon`, `manifest.json`, or the font links.
- Do not change any React component, the build config, the schema, or the database.
- Do not add any server side rendering, prerender step, or crawler middleware.

If anything about the change seems to require going outside `artifacts/web/index.html` and `artifacts/web/public/`, STOP and report it. Do not work around it.

---

## GATE 1: Recon only. Make no changes yet.

Confirm and paste raw output for each of the following:

1. The current full contents of the `<head>` block in `artifacts/web/index.html`.
2. Confirm `artifacts/web/public/` is the Vite public directory (files there are served at the site root). Show that existing files like `favicon.svg` and `apple-touch-icon.png` live there.
3. Confirm the production build copies `artifacts/web/public/` contents into the served output directory `artifacts/web/dist/public/`. State how you confirmed it (config or a test build listing).
4. Confirm there are currently zero Open Graph or Twitter card meta tags anywhere in `artifacts/web/index.html`.

Paste the real output for all four, then STOP and wait for confirmation before doing anything in Gate 2.

---

## GATE 2: Implement. Then STOP for human testing.

### Step A: Add the image asset
Place the provided `og-image.jpg` at exactly this path:

`artifacts/web/public/og-image.jpg`

It must end up served at the site root as `/og-image.jpg`.

### Step B: Add the meta tags
Add the following meta tags inside the `<head>` of `artifacts/web/index.html`. Place them directly after the existing `<title>` line. Match the existing indentation and formatting style of the file. Do not remove or reorder any existing tag.

Required end state (these exact tags and values):

```html
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Oasis Garden & Patio" />
<meta property="og:title" content="Oasis Garden & Patio" />
<meta property="og:image" content="https://oasisgardenandpatio.com/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Oasis Garden and Patio outdoor furniture" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Oasis Garden & Patio" />
<meta name="twitter:image" content="https://oasisgardenandpatio.com/og-image.jpg" />
```

Notes on intent (so nothing gets improvised):
- The image URL is intentionally an absolute URL to the primary domain. Link preview crawlers require an absolute URL, and a relative path will not work.
- There is intentionally NO `og:description` and NO `og:url`. Leaving `og:url` off means a shared product link keeps its own URL as the tap target rather than resolving to the homepage. Do not add either tag.

### Step C: Build and verify your own work
Run the production web build. Then paste all of the following:
1. The `git diff` of `artifacts/web/index.html` (raw).
2. The `<head>` block of the BUILT file `artifacts/web/dist/public/index.html`, showing the new tags are present in the build output.
3. A directory listing proving `artifacts/web/dist/public/og-image.jpg` exists after the build.

Then STOP. Do not publish or deploy. Report that Gate 2 is complete and ready for human testing.

---

## Verification (human tested, not agent tested)
The agent cannot see rendered link previews, so the agent's responsibility ends at Gate 2 Step C (tags present in the built HTML, image present in the build output).

Karen will test the actual preview. Two important testing notes to include in your handoff message:

1. The real card only appears on the deployed production site, because link preview crawlers fetch the live public URL. Viewing it in dev only confirms the tags exist in source and that `/og-image.jpg` loads.
2. Link previews are cached per URL by Apple, Facebook, and others. A URL that was shared before this change (for example an existing test message thread) may keep showing the old bare preview for a while. To see the new card immediately, test with a fresh link or add a throwaway query string such as `?v=1` to the URL. Facebook's Sharing Debugger can force a re scrape for the platforms that use it.

## Known behavior (not defects)
- Every page (home and all product pages) shows this same brand card. That is by design given the constraints.
- The preview image is served from the primary domain. If a link from the second domain (oasispatioumbrellas.com) is ever shared, it will show this same Oasis Garden and Patio card, since it is the same project. A separate card for that domain would be a future follow up, not part of this brief.
