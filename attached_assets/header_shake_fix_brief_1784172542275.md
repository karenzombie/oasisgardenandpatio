# Header Shrink Oscillation: Diagnostic and Fix Brief

## Symptom
- Desktop. Static (always-visible) header that transitions from full size to a condensed size as the user scrolls down.
- Vertical (up/down) jitter/shake, intermittent, occurring only while the header is in view, right around the point where it changes size.

## Most likely cause
A feedback loop between the header's size change and the page's scroll position / document height, with no deadzone (hysteresis) around the trigger threshold.

Mechanism: the header condenses when scroll passes a single threshold. Condensing removes vertical space, content below reflows, the scroll position (or the page's max scroll height) shifts back across that same threshold, the header expands, space is re-added, the threshold is crossed again. This can repeat every frame and reads as vertical shake. A single shared threshold combined with a CSS transition on height/padding makes it more visible.

## Do this first (recon only, report back before changing anything)
1. Find the component that renders the header and the logic that toggles its size (likely a scroll event listener or a scroll hook setting a boolean such as `isScrolled` / `isCondensed`).
2. Report:
   - The exact threshold logic (for example `scrollY > 100`). Is there ONE threshold used for both condensing and expanding?
   - Is the header in normal document flow, or is it `position: fixed` / `position: sticky`?
   - When the header condenses, does the content below it shift up (i.e., does the header height change affect document layout)?
   - Is there a CSS `transition` on the header's height, padding, or transform?

Stop after reporting. Do not implement yet.

## Likely fix (apply only after recon confirms the above)
Two changes, together:

1. Add hysteresis (a deadzone) so a single scroll position cannot flip the state back and forth:
   - Condense when scrollY passes an upper value (for example 120).
   - Expand again only when scrollY drops below a lower value (for example 60).
   - The gap between the two values prevents flip-flopping at any single point.

2. Decouple the header size change from document layout so resizing never alters scrollable height:
   - Condensing the header should not add or remove its own height from the document flow.
   - Typical approach: header is `position: fixed` (or `sticky`) with a fixed-height spacer element beneath it whose height does not change, so shrinking the visible header does not reflow the page or change max scroll.

Optional hardening: throttle the scroll handler with `requestAnimationFrame` and use a passive scroll listener. This is a performance improvement, not the root cause, so only add it if it does not complicate the fix.

## Verify
After the change, scroll slowly through the size-change zone on desktop. The header should transition once, cleanly, with no back-and-forth jitter. Test both on a tall page and near the bottom of a short page, since the bottom of a short page is where the loop shows up most.

## Check-in gate
Report the recon findings first. Then propose the exact code change and wait for confirmation before applying. Keep the change scoped to the header size logic only. Do not touch unrelated layout.
