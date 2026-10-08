---
title: RelayClarity Project Context
type: project-context
project: RelayClarity
status: active
updated: 2026-07-07
tags:
  - ai/context
  - project/relayclarity
---

# RelayClarity â€” Project Context

> [!info] AI quick context
> RelayClarity is the project framing and product memory. Use with [[01 Projects/RelayClarity/Architecture]], [[01 Projects/RelayClarity/Decisions]], and [[01 Projects/RelayClarity/Runs]] before changing the codebase.

RelayClarity is a product showcase for a **voice agent deployment platform** â€” software
for moving AI voice agents from pilot to production with evidence. See [[RelayClarity Memory]].

## Product workflow

- Customer workspace setup: goals, channels, guardrails, launch criteria.
- Enterprise integration mapping: CRM, telephony, knowledge base, helpdesk.
- Voice tuning: provider selection, response-start latency, barge-in.
- Evaluation suite: scripted + adversarial scenarios (resolution rate, containment, CSAT as gates).
- Deployment insights â†’ reusable platform improvements.
- Pilot-to-production handoff report generation.

## Recent implementation context

- Obsidian-backed knowledge search is part of the backend. The adapter reads markdown from `OBSIDIAN_VAULT_PATH` and reports `obsidian_vault` through provider status when active.
- The dashboard AI Agents route uses Obsidian vault labels rather than generic knowledge-base labels.
- Keep the interface quiet and operational. For dashboard views, avoid marketing-style cards and keep controls clear for repeated use.
- The home nav Products dropdown was simplified to title-only rows on 2026-07-07.

## Why it exists

Shaped around a Zoom **Applied AI Engineer** role (Job ID R19227, London/Remote) that deploys
Zoom Virtual Agent into live customer environments. RelayClarity is the candidate's own product
framing of that work â€” not a generic portfolio demo.

## Brand

- Exact name `RelayClarity`. Palette: graphite, white, blue, teal, slate. Clean modern B2B.
- Logo: `assets/relayclarity-logo.svg`.
- Avoid: purple AI gradients, decorative blobs, vague AI tropes. Keep clean and sectioned.

## Source docs in repo

`README.md`, `PROJECT_NOTES.md`, `IMPLEMENTATION_PLAN.md`, `DEMO_RUNBOOK.md`, `AI_BACKEND_RUNBOOK.md`.
