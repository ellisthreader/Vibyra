---
title: Frontend
aliases:
  - React Frontend
  - Public Portal
tags:
  - frontend
  - react
  - ui
  - service-priority-ai
project: Service Priority AI
status: active
note_type: implementation
created: 2026-06-04
updated: 2026-06-29
---

# 03 — Frontend

A React 19 + Vite + TypeScript single-page app with three surfaces behind a tiny hash router. Newly rebuilt 2026-06-04 (see [[09 - Decisions]]).

## Structure
```
frontend/src/
  main.tsx            # entry: router + shell + chat widget wiring
  router.tsx          # useHashRoute() -> "home" | "dashboard"
  api.ts              # types, API client, fallbacks, helpers
  layout/TopNav.tsx   # sticky top navigation, API status pill
  pages/Home.tsx      # public portal composition
  home/content.ts     # ORIGINAL placeholder copy (no third-party assets)
  home/sections.tsx   # hero, services, queue, values, quotes, news, CTA, footer
  pages/Dashboard.tsx # OpenAI-style console -> [[04 - Dashboard]]
  dashboard/          # TriageForm + read-only panels
  chat/ChatWidget.tsx # docked assistant -> [[05 - Chatbot]]
  components/primitives.tsx  # Kpi, PanelTitle, Metric, BarRow, Badge
  styles/             # tokens, base, layout, portal, dashboard, chat
```

## Three surfaces
1. **Public portal** (`app--home`) — a civic service-portal landing page: hero with search, popular services, an illustrative priority queue, value props, testimonials, news, CTA, footer. Light teal "civic" theme. All imagery is **original SVG / CSS gradients** — no scraped or copyrighted assets.
2. **Console dashboard** (`app--dashboard`) — OpenAI-platform-inspired operator view → [[04 - Dashboard]].
3. **Chatbot widget** — floating assistant on the public home route only → [[05 - Chatbot]].

## Theming
Two palettes share one shell, scoped by a wrapper class:
- `--civic-*` tokens → public portal (light, teal/amber)
- `--c-*` tokens → console (neutral greys, near-black primary, OpenAI green accent)

Defined in `styles/tokens.css`. The shell (`app-body`) is a CSS grid: `1fr` main column + `var(--rail-width)` chat rail; collapses to an overlay below 1140px.

## State
`main.tsx` owns: current route, chat open/closed, API online-ping (every 15s), the shared `caseInput` and last `prediction` — so the dashboard form and the chatbot's "triage my current case" read the **same** case context.

## Related notes

- [[04 - Dashboard]] - employee and manager console
- [[05 - Chatbot]] - home-route assistant behavior
- [[02 - Architecture]] - backend routes and data flow
- [[13 - Project Operating Memory]] - UI constraints to preserve

#servicePriorityAI #frontend
