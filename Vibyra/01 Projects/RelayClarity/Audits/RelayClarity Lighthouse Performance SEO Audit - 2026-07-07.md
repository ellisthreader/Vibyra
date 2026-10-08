---
title: RelayClarity Lighthouse Performance SEO Audit - 2026-07-07
type: lesson
project: RelayClarity
date: 2026-07-07
status: active
tags:
  - lesson
  - audit
  - performance
  - seo
  - project/relayclarity
aliases:
  - RelayClarity Lighthouse Audit
  - RelayClarity Performance SEO Plan
---

# RelayClarity Lighthouse Performance SEO Audit - 2026-07-07

> [!summary]
> Lighthouse found that RelayClarity's public marketing site is mostly healthy on desktop, but the homepage mobile path is severely slowed by oversized images, route-insensitive bundling, render-blocking CSS, and first-load work that should be delayed. The permanent rule is: every public marketing change must be checked against Lighthouse, asset size budgets, and crawl metadata before calling it done.

## How To Use This Note

Use this note before performance, SEO, homepage, marketing route, image, video, or bundling work in `/home/ellis/Desktop/RelayClarity`.

1. Read [[RelayClarity]] and [[RelayClarity Memory]] first for project context.
2. Use this note to know what broke, how it was measured, and what to prevent.
3. Use [LIGHTHOUSE_PERFORMANCE_SEO_PLAN.md](file:///home/ellis/Desktop/RelayClarity/LIGHTHOUSE_PERFORMANCE_SEO_PLAN.md) for the full repo-side plan.
4. Rerun the Lighthouse commands below after performance or SEO changes.
5. Do not mark future marketing work complete if homepage mobile LCP, TBT, robots, metadata, or payload budgets are still failing.

## What Was Audited

Audit date: 2026-07-07.

Tooling:

```powershell
npm run build
npm run preview -- --port 4177 --strictPort
npm exec -- lighthouse http://127.0.0.1:4177/ --quiet --chrome-flags='--headless=new --no-sandbox --disable-gpu' --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=tmp/lighthouse-audit/home-mobile.json
npm exec -- lighthouse http://127.0.0.1:4177/ --quiet --preset=desktop --chrome-flags='--headless=new --no-sandbox --disable-gpu' --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=tmp/lighthouse-audit/home-desktop.json
```

Routes audited:

- `/`
- `/platform`
- `/integrations`
- `/pricing`
- `/roi-calculator`
- `/demo`
- `/launch`
- `/reviews`
- `/contact-sales`

Artifacts:

- JSON reports: `tmp/lighthouse-audit/*.json`
- Extracted summary: `tmp/lighthouse-audit/summary.txt`
- Full plan: `LIGHTHOUSE_PERFORMANCE_SEO_PLAN.md`

## Key Findings

### Homepage Mobile Is The Main Problem

Lighthouse mobile for `/`:

| Metric | Result |
|---|---:|
| Performance | 36 |
| LCP | 32.1s |
| TBT | 4,460ms |
| Time to Interactive | 34.3s |
| Main-thread work | 11.5s |
| Total transfer | 11,969 KiB |
| Image transfer | 11,424 KiB |

Largest homepage transfers:

- `workflow-business-brief-photo-v3`: about 2.16 MB
- `workflow-customer-questions-photo-v4`: about 2.05 MB
- `demo-agent-avatar`: about 1.99 MB
- `workflow-conversations-professional`: about 1.86 MB
- `launch-photo-test`: about 1.85 MB
- `relayclarity-hero-realistic`: about 1.51 MB
- `voice-orb-demo-loop.mp4`: about 483 KB

Source areas:

- `src/main.tsx` top-level image imports around lines 6-24.
- Homepage workflow image data around line 541.
- Workflow timeline image rendering around lines 643 and 667.
- Demo avatar render around line 887.

### Bundle And CSS Are Not Route-Aware

The app currently ships one large React entry for public marketing, auth, setup, dashboard, integrations, voice setup, calls, conversations, and utilities.

Build output found:

- JS bundle: about 708 KB minified, about 211 KB transferred in Lighthouse.
- CSS bundle: about 529-536 KB minified, about 88 KB transferred in Lighthouse.
- Vite warns that chunks exceed 500 KB.
- Lighthouse reports 119-141 KiB unused JS and 75-85 KiB unused CSS on many routes.

Source areas:

- Route types around `src/main.tsx` line 2677.
- `readAppViewFromLocation` around line 3968.
- `appViewUrl` around line 4016.

### Marketing Pages Trigger API Errors

Lighthouse reported browser console errors on marketing routes.

Cause:

- `refreshAuth()` calls `/api/auth/me` around `src/main.tsx` line 4171.
- It runs on initial app load around line 4264, even on public routes.
- In static Vite preview, this creates network 404/500 failures.

Rule:

- Public marketing pages must render without needing the backend.
- Only dashboard, setup, login, or explicit dashboard-open flows should check auth.

### SEO Basics Are Missing

Most routes scored SEO 92 because `robots.txt` is missing. Vite's SPA fallback serves HTML at `/robots.txt`, which Lighthouse parses as invalid robots text.

Current `index.html` only has:

- one global title
- one global description
- no canonical URL
- no Open Graph metadata
- no Twitter card metadata
- no sitemap
- no structured data

Missing files:

- `public/robots.txt`
- `public/sitemap.xml`
- `public/site.webmanifest`

### Integrations Page Is CPU-Heavy

`/integrations` mobile:

| Metric | Result |
|---|---:|
| Performance | 57 |
| LCP | 4.3s |
| TBT | 1,280ms |
| Main-thread work | 5.5s |
| Transfer | 352 KiB |

The payload is small, so the issue is CPU/render work, likely from rendering many integration/logo tiles and animation-heavy layout during first paint.

### Large Videos Need A Loading Strategy

Public media sizes:

- `relayclarity-launch-video.mp4`: about 12.8 MB
- `chatoraai-launch-video.mp4`: about 3.3 MB
- `ai-assistant-demo-loop.mp4`: about 636 KB
- `voice-orb-demo-loop.mp4`: about 482 KB
- `robot-head.glb`: about 1.1 MB

Source areas:

- `/voice-orb-demo-loop.mp4` around `src/main.tsx` lines 3858 and 4784.
- `/relayclarity-launch-video.mp4` around line 4746.

## Route Score Snapshot

| Route | Mobile perf | Desktop perf | Mobile SEO | Main issue |
|---|---:|---:|---:|---|
| `/` | 36 | 84 | 92 | Huge images, long tasks, 32.1s LCP |
| `/integrations` | 57 | 67 | 92 | CPU-heavy catalog render |
| `/platform` | 76 | 99 | 92 | Image-heavy route |
| `/launch` | 76 | 99 | 100 | Image-heavy route |
| `/reviews` | 83 | 100 | 92 | Moderate LCP/image delivery |
| `/pricing` | 88 | 99 | 92 | Shared JS/CSS and robots |
| `/roi-calculator` | 90 | 100 | 92 | Shared JS/CSS and robots |
| `/demo` | 91 | 100 | 92 | Minor heading order plus robots |
| `/contact-sales` | 91 | 100 | 92 | Robots and shared CSS/JS |

## Prevention Rules

### Rule 1: Public Routes Must Not Depend On The Backend

Trigger:

- Any public marketing page loads.

Action:

- Do not call `/api/auth/me`, integrations APIs, dashboard APIs, or workspace APIs on public route boot.
- Check auth only for `/dashboard`, `/setup`, `/login`, or after the user clicks a dashboard/sign-in action.

Pass condition:

- Lighthouse `errors-in-console` passes on all marketing pages.

### Rule 2: Marketing Images Need Size Budgets

Trigger:

- Adding or replacing any `assets/*.png`, `assets/*.jpg`, or public visual used on marketing pages.

Action:

- Generate AVIF/WebP variants.
- Generate mobile/tablet/desktop widths.
- Use `srcSet` and `sizes`.
- Add explicit width/height or CSS `aspect-ratio`.
- Lazy-load below-the-fold images.

Budgets:

- Hero/LCP image: target below 250 KB.
- Below-fold section image: target below 150-250 KB per responsive variant.
- No individual marketing PNG/JPG should ship at 1-2 MB.
- Homepage initial transfer target: below 1.5 MB.

### Rule 3: Split Route Code Before Adding More Features

Trigger:

- Adding dashboard/setup/voice/calls/conversations code or heavy page modules.

Action:

- Keep the public marketing entry small.
- Lazy-load dashboard, setup, auth, and heavy marketing pages.
- Split CSS by route or lazy component.

Budgets:

- Simple marketing route JS transfer: below 80-100 KB.
- Simple marketing route CSS transfer: below 35-40 KB.
- Avoid Vite chunk warnings above 500 KB.

### Rule 4: Homepage Motion Must Be Deferred Or Visible-Only

Trigger:

- Adding Framer Motion, timers, scroll transforms, animated demos, or large sections to the homepage.

Action:

- Mount below-the-fold sections with `IntersectionObserver`.
- Add `content-visibility: auto` and `contain-intrinsic-size` to long sections.
- Start non-critical animation after visible/idle, not on boot.
- Respect `prefers-reduced-motion`.

Budgets:

- Homepage TBT below 200ms.
- No long task above 200ms.
- Homepage mobile LCP below 2.5s.

### Rule 5: SEO Files And Route Metadata Are Required

Trigger:

- Adding, renaming, or removing a public route.

Action:

- Update `public/robots.txt`.
- Update `public/sitemap.xml`.
- Add or update route title, description, canonical, Open Graph, and Twitter metadata.
- Add structured data where relevant.

Minimum `robots.txt`:

```txt
User-agent: *
Allow: /

Sitemap: https://relayclarity.com/sitemap.xml
```

Pass condition:

- Lighthouse SEO 100 on public routes.

### Rule 6: Integrations Catalog Must Be Progressive

Trigger:

- Adding many connector logos/cards or remote favicon URLs.

Action:

- Render only active/top connectors initially.
- Lazy-render lower catalog groups.
- Avoid remote favicon endpoints for above-the-fold icons.
- Use fixed dimensions for every logo.
- Defer catalog animations until after first paint.

Target:

- `/integrations` mobile performance above 85.
- TBT below 200ms.

## Implementation Order

1. Add `robots.txt`, `sitemap.xml`, route metadata, and Open Graph/Twitter tags.
2. Stop public marketing pages from calling `/api/auth/me` on first load.
3. Compress and responsive-load homepage/platform/launch/reviews images.
4. Add dimensions/aspect ratios to all images.
5. Route-split `src/main.tsx`, especially dashboard/setup/auth from marketing.
6. Split CSS so marketing routes do not carry dashboard/setup styles.
7. Lazy-mount below-the-fold homepage sections and defer animation.
8. Progressive-render the integrations catalog.
9. Add Lighthouse and bundle budgets to repeat the audit.

## Copyable Future Prompt

Use this when asking an agent to work on RelayClarity marketing performance:

```text
Before changing RelayClarity public marketing pages, read the Obsidian note [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]]. Preserve the prevention rules: public pages must not call backend APIs on boot, large images need responsive AVIF/WebP variants with explicit dimensions, dashboard/setup code must stay out of the marketing bundle, robots/sitemap/per-route metadata must stay valid, and Lighthouse mobile must be rerun for all affected routes.
```

## Related

- [[RelayClarity]]
- [[RelayClarity Memory]]
- [[RelayClarity Homepage Redesign - 2026-07-07]]
- [Repo plan](file:///home/ellis/Desktop/RelayClarity/LIGHTHOUSE_PERFORMANCE_SEO_PLAN.md)
