---
title: RelayClarity Home Parallax Incident - 2026-07-09
date: 2026-07-09
tags:
  - relayclarity
  - incident
  - homepage
  - parallax
  - prevention
status: fixed
project: "[[RelayClarity]]"
---

# RelayClarity Home Parallax Incident - 2026-07-09

## What happened

The RelayClarity home page sometimes lost the platform parallax effect or text after refresh, switching browser tabs, navigating to another app tab/page, then returning to the home page.

Visible symptom:

- The pinned platform section could render without the expected scroll reveal/parallax text.
- The failure was intermittent because it depended on browser visibility and route lifecycle timing.

## Root cause

The platform parallax scene used Framer Motion `useScroll({ target: platformRef })` from the parent `App` component, while the home page DOM is conditionally unmounted when the app navigates to other views.

That meant Framer Motion could keep stale or zero target measurements after:

- refreshing during layout/image/video load,
- hiding and showing the browser tab,
- navigating away from home and back,
- route changes where the target ref was temporarily null.

When those measurements were stale, the motion values could resolve to states where the platform words/subline were not visible.

## Fix applied

Moved the platform parallax scene into a dedicated `PlatformParallaxSection` component in `src/main.tsx`.

The section now owns:

- `platformRef`
- `marketingVideoRef`
- `useScroll({ target: platformRef })`
- platform word/subline/headline/video transforms
- reduced-motion fallback styles
- the marketing video `IntersectionObserver`
- measurement refresh on `focus`, `pageshow`, and `visibilitychange` back to visible

This ties scroll measurement lifecycle to the actual mounted DOM node instead of a parent component that can outlive the home section.

## Prevention checklist

- [ ] Keep Framer Motion `useScroll({ target })` hooks inside the component that renders the target element.
- [ ] Do not store route-specific scroll target refs in a parent that conditionally unmounts the target DOM.
- [ ] For pinned or parallax sections, verify refresh, route away/back, browser tab hide/show, and reduced-motion mode.
- [ ] After changing home page scroll animation code, run `npm run typecheck` and `npm run build`.
- [ ] Use a browser smoke test that checks `.platform-word` and `.platform-subline` computed opacity after returning to `/`.

> [!bug] Rule for future fixes
> If scroll animation text disappears intermittently, suspect stale target measurements before changing CSS opacity or z-index. The lifecycle of the ref and the DOM node must match.

## Verification

- `npm run typecheck` passed.
- `npm run build` passed.
- Headless Chrome CDP smoke test confirmed the platform words and subline are visible on initial `/` load and after navigating away to `/pricing` then back to `/`.
- Dev server used for verification: `http://localhost:5182/`.

