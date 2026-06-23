# 2026-06-23 — Timeline Scroll-Progress Indicator

## Goal

Make the homepage workflow timeline take longer to scroll, and add a blue line that follows
scroll progress down the timeline with a grey default track.

## What changed

- `src/main.tsx` — `WorkflowPinnedTimeline`:
  - Added `useSpring` import.
  - `railProgress = useSpring(scrollYProgress, {stiffness:120, damping:30})`.
  - Rendered `.workflow-copy-rail` (grey track) containing `motion.span.workflow-copy-rail-fill`
    whose `scaleY` is bound to `railProgress` (full when reduced-motion).
- `src/styles.css`:
  - Replaced the static `.workflow-pinned-copy::before` gradient line with
    `.workflow-copy-rail` (grey base `#d3dbe6`, 4px, `overflow:hidden`) +
    `.workflow-copy-rail-fill` (blue `linear-gradient(180deg,#2563eb,#1d4ed8)`, `transform-origin:50% 0`).
  - Lengthened scroll: `.workflow-timeline-chapter` min-height `min(520px,72vh)`→`min(760px,96vh)`;
    `.workflow-pinned-copy` gap `clamp(54px,9vh,92px)`→`clamp(96px,16vh,168px)`.

## Gotchas

- The visible timeline line is the `.workflow-pinned-copy` rail, NOT `WorkflowScrollLine`
  (that component is `display:none` at styles.css ~line 23212).
- Verified live via Chrome CDP (`node --experimental-websocket`, since global `WebSocket` and the
  `ws` package are unavailable on Node 20.20): grey base + blue fill confirmed by computed styles;
  fill height grows with scroll (~1409px mid-section → ~2160px near end). Typecheck passes.

## Follow-up

- Rail is intentionally thin (4px) to match the minimalist aesthetic; can be bolder if wanted.
