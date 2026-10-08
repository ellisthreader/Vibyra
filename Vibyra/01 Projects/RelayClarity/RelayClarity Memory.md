---
title: RelayClarity Memory
type: project-memory
project: RelayClarity
status: active
updated: 2026-07-10
tags:
  - ai/memory
  - project/relayclarity
aliases:
  - RelayClarity AI Memory
---

# RelayClarity Memory

> [!info] AI quick context
> Start here for RelayClarity work. This note scopes the project, read order, and links to [[01 Projects/RelayClarity/Project Context]], [[01 Projects/RelayClarity/Architecture]], [[01 Projects/RelayClarity/Decisions]], and [[01 Projects/RelayClarity/Runs]].

Scope: the **RelayClarity** project â€” a separate codebase from Vibyra, living at
`/home/ellis/Desktop/RelayClarity` (git: `ellisthreader/test-zoom-project`).
It also serves the ClearDBS website's live AI voice-call demo on port `8787`
(`live-call.html`) â€” see [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]].
AI chat traffic is auto-logged to [[04 Archive/Raw Logs/RelayClarity AI Chat Log (2026-07)|the archived AI Chat Log]]
via `OBSIDIAN_AI_CHAT_LOG_PATH`; mine it for prompt/response quality review, but
treat it as a deep reference (search with `rg`, never read end-to-end).
This folder is RelayClarity's scoped area inside the global vault. Vibyra notes
elsewhere under `01 Projects/Vibyra` do **not** apply to RelayClarity.

## Read order (RelayClarity tasks)

1. This file.
2. [[01 Projects/RelayClarity/Project Context]] â€” what it is, brand, why it exists.
3. [[01 Projects/RelayClarity/Architecture]] â€” stack, scripts, file map.
4. For public marketing performance or SEO work, read [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]].
5. One focused note or run log only if the task needs it.

Follow the global `Memory Protocol.md` token rules: don't read the whole repo,
prefer `rg`, keep notes short, put logs under `RelayClarity/Runs/`.

## One-line mental model

A product showcase + working backend for a voice-agent **deployment** platform
(pilot â†’ production), framed for a Zoom Applied AI Engineer role.

## Current operating memory

- Active local path for this project is `/home/ellis/Desktop/RelayClarity`.
- Obsidian is now the knowledge source for dashboard agents. `.env` sets `OBSIDIAN_VAULT_PATH=C:\Users\Ellis\Documents\Global`; if that path is invalid the backend falls back to local JSON.
- Dashboard agents must show Obsidian knowledge in their connected tools: standard workspace agents Clara, Atlas, Scout, Relay; ClearDBS workspace agents Clara, Harbor, Sentinel, Scribe.
- The Products nav dropdown should stay title-only: Integrations, Pricing, ROI Calculator. Do not re-add descriptive subtext below each title.
- A vertical text cursor appearing inside normal preview headings is Chromium caret browsing, usually toggled with F7, not editable page content. Keep non-editable content's caret transparent while preserving form-field carets. See [[01 Projects/RelayClarity/Incidents/RelayClarity Preview Text Caret Incident - 2026-07-10|the preview text caret incident]].
- Zoom interview-prep work should lead with CX outcomes and discovery language: containment, CSAT, AHT, FCR, contact drivers, POC scope, guardrails, CRM/helpdesk/knowledge integrations, and measurable business value.
- Lighthouse audit on 2026-07-07 found public marketing guardrails: no backend auth/API calls on public boot, valid robots/sitemap/per-route metadata, responsive compressed images with dimensions, route-split dashboard/setup code from marketing, and rerun Lighthouse mobile before calling performance/SEO work done. See [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]].

## Index

- [[01 Projects/RelayClarity/Project Context]]
- [[01 Projects/RelayClarity/Architecture]]
- [[01 Projects/RelayClarity/Decisions]]
- [[01 Projects/RelayClarity/Runs]]
- [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]]
- [[01 Projects/RelayClarity/Incidents/RelayClarity Preview Text Caret Incident - 2026-07-10]]
- [[01 Projects/Vibyra/Runs/Two Week Chat Context Review - 2026-07-07]]

## Not to be confused with Vibyra

Vibyra = the Expo mobile + desktop bridge + Laravel product. RelayClarity =
this React/Vite + Express voice-agent showcase. Different repos, different stacks.
