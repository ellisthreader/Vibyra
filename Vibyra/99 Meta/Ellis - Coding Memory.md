---
title: Ellis - Coding Memory
type: ai-context
status: active
updated: 2026-07-16
source: Codex chats
confidence: high
tags:
  - ai/context
  - coding-memory
---

# Ellis - Coding Memory

> [!summary] Load this first
> Ellis is an AI-assisted product builder who works mainly on Windows and uses Codex to inspect, implement, run, and visually verify real applications. The strongest evidence is in product/workflow design, rapid UI iteration, agent orchestration, and durable Obsidian memory. The chats show repeated successful delivery across full-stack projects, but they do not prove that every code change was typed manually by Ellis. Keep career and skill claims explicit about AI assistance.

## Technical background

- Repeatedly works across [[01 Projects/RelayClarity/RelayClarity|RelayClarity]], [[01 Projects/Vibyra/Vibyra|Vibyra]], [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS]], [[01 Projects/Service Priority AI/Service Priority AI|Service Priority AI]], and [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]].
- Preferred application stack is React + TypeScript + Vite for frontends, with either Node/Express or Laravel/PHP behind it. SQLite is common locally; Electron is used for desktop delivery.
- Has practical project exposure to OpenAI APIs, ElevenLabs voice, Zoom/contact-centre integrations, OAuth-style integrations, Azure ML concepts, Stripe Terminal, receipt hardware, and Obsidian-backed knowledge retrieval.
- See [[02 Areas/Technical Skills Inventory|Technical Skills Inventory]] for evidence-calibrated levels and [[02 Areas/Technical Career Evidence|Technical Career Evidence]] for safe CV/interview claims.

## Strongest evidenced abilities

- Translating business workflows into concrete product flows, especially onboarding, customer support, checkout/POS, decision support, calls, conversations, and human handoff.
- Iterating UI from screenshots and live-state feedback; prioritises simplicity, fit, visual consistency, mobile/desktop checks, and real interactions.
- Directing multi-agent coding work, assigning bounded reviews, integrating findings, and asking for builds/tests/screenshots before accepting work.
- Maintaining project memory in Obsidian so repeated bugs become lessons, incidents, decisions, and runbooks.

## Active priorities

1. **Vibyra** - the densest current work: Windows desktop and AI-terminal reliability, input/scroll/reconnect behavior, theme and Settings consistency, model presentation, prompt telemetry, and safe local bug reporting. Significant local changes remain beyond the last pushed commit.
2. **Hong Kong Express** - active again as of 2026-07-16, with customer profile, orders, saved addresses/maps, allergens/nutrition, checkout, live chat, imagery, Electron isolation, and payment/receipt reliability in motion. Keep regulatory data provisional until restaurant/supplier verified.
3. **RelayClarity** - continue shipping readiness, dashboard/setup simplification, performance/SEO, integration realism, and production deployment. The local working tree contains substantial uncommitted work.
4. **Zoom Interview Prep** - active Round 2 CX Solution Engineering preparation with scored typed/spoken answers, RAG/voice/reliability material, and an interactive whiteboard.
5. **ClearDBS** and **Service Priority AI** - preserve their canonical repo and governance boundaries while current effort is concentrated elsewhere.

## Important completed milestones

No major project is confidently `Completed`; the strongest finished milestones are:

- RelayClarity local auth/onboarding/dashboard/marketing flows and the Lighthouse improvement pass.
- Service Priority AI's synthetic model, FastAPI/React demo, Responsible AI documentation, and interview presentation artifacts.
- HKE's local customer/staff workflows, menu fallback, Stripe sandbox reader connection, and Epson/QR receipt prototypes.
- Vibyra's Windows launcher/branding repairs and several terminal input/provider/theme regression passes.
- ClearDBS's compact public help/search/chat experience and compliance boundary.

## Current learning priorities

- Reproduce one project change independently from a clean clone.
- Improve Git/commit/release discipline across large local worktrees.
- Deepen TypeScript/React, API contracts, automated tests, and security fundamentals.
- Build measurable RAG/LLM evaluation and observability rather than relying on demos.
- Reverify one cloud deployment end to end. See [[02 Areas/Coding Learning Roadmap|Coding Learning Roadmap]].

## Usual workflow

1. Confirm the exact repository, branch, remote, running ports, and URL.
2. Read the smallest relevant project memory note.
3. Inspect the real code, screenshot, logs, or live flow.
4. Implement the root fix while preserving unrelated dirty work.
5. Run the relevant typecheck/build/tests and visually verify UI at desktop and mobile sizes.
6. Give the working URL and a short outcome summary.
7. If a bug repeats or takes multiple passes, update [[03 Resources/Codex Lessons Learned|Codex Lessons Learned]] or the project incident/lesson note.
8. Label handoffs Planned, Implemented, Verified, or Blocked; never treat a prompt-transcript `completed` event as proof of product completion.

## Coding and design preferences

- Clean, modern, professional, and operational; fewer cards, less explanatory copy, and strong hierarchy.
- Avoid clutter, unnecessary nested boxes, excessive gradients, decorative blobs, and pages that feel zoomed-in.
- UI should fit the intended viewport without clipping, overlap, background gaps, or unnecessary scrolling.
- Screenshot/reference tasks require a fresh rendered comparison, not source inspection alone.
- Dashboard pages should be scannable and task-focused. Customer journeys should be step-by-step and obvious.
- Prefer custom, consistent dropdowns and real brand icons/logos over native controls or placeholder letters when the product design calls for them.
- AI in public-service or compliance contexts must remain advisory, grounded, and clear about human accountability.

## Common difficulties

- Wrong lookalike folder, branch, stale backend, or old port being mistaken for the live project.
- Large dirty worktrees and pushed commits lagging behind the latest local UI.
- Windows/Electron startup identity, stale bridge processes, visible helper windows, PTY focus/input, and provider runtime mismatch.
- CSS overflow, popover clipping, fixed-height layouts, responsive fit, stale animation measurements, and live UI not matching the edited source because of an old Vite build.
- API base URLs, Windows `localhost` IPv6 behavior, CORS across changing Vite ports, and OAuth/API-key setup.
- Needs support with low-level code diagnosis, CLI syntax, production deployment/security, automated test design, and distinguishing a convincing local demo from verified production deployment.

## Instructions for future coding agents

- Treat short or typo-heavy prompts by intent. `Review` means inspect the real artifact; `fix` means implement and verify; `give me the link` means run/probe the correct app and return its URL.
- Never claim Ellis manually authored code merely because a Codex worker implemented it. Say `built with AI assistance`, `directed`, or `implemented in the project` unless manual authorship is independently confirmed.
- Do not say `done` until the live page, endpoint, build, or test has been checked.
- Check `git status` before edits. Do not overwrite or discard unrelated changes.
- Never copy secrets from chat logs. A prior chat contained an exposed OpenAI key; treat any pasted credential as sensitive and rotate it if still active.
- For project-specific work, start from the project memory linked below.

## Major project memory

- [[01 Projects/RelayClarity/RelayClarity Memory|RelayClarity Memory]]
- [[01 Projects/Vibyra/Memory/Project Context|Vibyra Project Context]]
- [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]]
- [[01 Projects/Service Priority AI/Azure Project/12 - AI Quick Context|Service Priority AI Quick Context]]
- [[01 Projects/Hong Kong Express/HKE Memory|HKE Memory]]
- [[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]]
- [[03 Resources/Architecture Decision Register|Architecture Decision Register]]
- [[99 Meta/Codex Chat Memory Audit - 2026-07-10|Codex Chat Memory Audit - 2026-07-10]]
- [[99 Meta/Prompt Activity Review - 2026-07-16|Prompt Activity Review - 2026-07-16]]
