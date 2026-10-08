---
title: Homepage Redesign Implementation Plan
scope: public-marketing
status: implemented
updated: 2026-07-18
---

# Homepage Redesign Implementation Plan

## Goal

Make the Laravel homepage explain Vibyra as one connected phone-and-desktop AI
workspace, then prove the product's depth without turning the first viewport
into a feature dashboard.

## Audience And Promise

- Lead audience: developers, technical founders, indie hackers, and AI power users.
- Core promise: run real project work on the computer and stay in the review,
  approval, and preview loop from the phone.
- Required qualification: Vibyra Desktop is required for local projects;
  platform, runtime, provider-account, plan, and release availability varies.

## Page Order

1. Immersive scroll-video hero: Start, Send, Run, Review.
2. Local/cloud architecture: phone, desktop, and Vibyra account responsibilities.
3. Four-step workflow: Connect, Direct, Review, Preview.
4. Three outcomes: momentum, visibility, and workspace choice.
5. Desktop and phone depth with real product media.
6. Real-product proof: multi-terminal agents, voice/memory, and model/account choice.
7. Complete capability atlas grouped by Connect, Build, Work, Talk + remember,
   Review from phone, and Share + manage.
8. Trust, API-backed pricing, FAQ, and one final download action.

## Media Plan

- Keep the existing immersive hero video and its direct-stream/buffered scrub path.
- Use current Vibyra captures for every concrete product claim.
- Use authentic Vibyra captures for every device and interface. Do not use
  generated people, hands, phones, computers, or invented UI on the homepage.
- Generated raster art is limited to abstract, text-free campaign atmosphere
  behind genuine product captures; the active cobalt stage follows this rule.
- Frame raw captures with consistent browser chrome, crop control, captions,
  and campaign lighting so diagnostic terminal output is never the focal point.
- Store homepage media under `backend/public/media/homepage/` with useful alt text.

## Design Rules

- Use the approved Graphite + Cobalt system; legacy Tailwind `violet` utilities
  remain aliases to cobalt until the marketing source is renamed mechanically.
- Keep real product screenshots large and readable.
- Keep the hero terminal proof immediately readable: show Claude and Codex as
  keyboard-accessible tabs with distinct commands, activity, valid code diffs,
  timings, and visible completion results before decorative animation. This is
  an interactive marketing simulation and must not imply live command execution.
- Prefer chaptered editorial rows and a single capability matrix over repeated
  bento-card layouts.
- Preserve reduced-motion behavior, semantic headings, keyboard focus, explicit
  image dimensions, and lazy loading below the hero.

## Validation

- Run the marketing source test and Vite production build.
- Render the Laravel homepage at desktop and phone widths.
- Confirm the hero stays full-screen, product captures load, navigation anchors
  resolve, and the capability atlas remains legible on narrow screens.
- Search production marketing source for retired purple/pink literals.

## Source Ownership

- Composition: `backend/resources/js/marketing/App.jsx`
- Product proof: `sections/ProductProof.jsx`
- Capability catalogue: `sections/CapabilityAtlas.jsx`
- Desktop/phone depth: `sections/ProductDepth.jsx`
- Media presentation: `backend/resources/css/marketing/product-media.css`
- Brand tokens: `backend/resources/css/marketing.css`
