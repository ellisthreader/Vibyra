---
type: project
status: active
priority: 1
stack:
  - React
  - Vite
  - TypeScript
  - Express
project_path: /home/ellis/Desktop/RelayClarity
repository: https://github.com/ellisthreader/test-zoom-project
last_commit: 2026-07-09
next_action: Review and commit the large local worktree, then verify production deployment, auth, checkout, and all public/dashboard routes
tags:
  - project/relayclarity
---

# RelayClarity

Product showcase + working backend for a voice-agent **deployment** platform (pilot to production),
framed for a Zoom Applied AI Engineer role.

## Project Record

- **Target users:** Businesses launching AI phone/chat support, CX operators, implementation teams, and managers reviewing calls, conversations, agents, knowledge, and outcomes.
- **Status:** Active local development; not confirmed production-ready.
- **Architecture:** React/Vite client -> Express API -> SQLite and external AI/voice/integration adapters. See [[01 Projects/RelayClarity/Architecture|Architecture]].
- **Authentication:** Local email/password auth with hashed passwords and sessions was implemented and tested; production hardening remains unverified.
- **Database:** SQLite through `better-sqlite3`.
- **Important files:** `src/main.tsx`, `src/styles.css`, `src/setup-redesign.css`, `server/index.tsx`, `server/auth.tsx`, `server/ai/`, `server/voice/`, `server/adapters/`, `scripts/dev.mjs`.
- **Integrations:** OpenAI, ElevenLabs, Zoom/contact-centre webhook, telephony/Twilio-style adapter, CRM/helpdesk/knowledge adapters, OAuth/config catalog, and Obsidian Markdown retrieval.
- **Skills evidenced:** React/TypeScript product work, API/auth design exposure, voice/LLM integration, testing, Lighthouse, workflow design, visual QA.
- **Source window:** Codex sessions 2026-06-27 to 2026-07-10; repository state checked 2026-07-10.

## Planned Features And Limitations

- Production deployment, billing/payment live readiness, real customer tenancy, OAuth provider verification, security review, observability, SEO, and bundle/performance budgets remain incomplete or unverified.
- The app is concentrated in a very large `src/main.tsx`/CSS surface; component and route decomposition is a maintainability priority.
- See [[03 Resources/Architecture Decision Register|Architecture Decision Register]] and [[03 Resources/Codex Lessons Learned|Codex Lessons Learned]].

## System Links

- [[01 Projects/Projects|Projects]]
- [[02 Areas/Portfolio and Career|Portfolio and Career]]
- [[02 Areas/Project Maintenance|Project Maintenance]]
- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[03 Resources/Development Commands|Development Commands]]

## Links

- [Open project folder](file:///home/ellis/Desktop/RelayClarity)
- [Open repository](https://github.com/ellisthreader/test-zoom-project)
- [Open README](file:///home/ellis/Desktop/RelayClarity)

## Memory (scoped, in this global vault)

- [[RelayClarity Memory]] â€” entry point / read order
- [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]] - Lighthouse findings, rerun commands, SEO/performance prevention rules
- [[RelayClarity Home Parallax Incident - 2026-07-09]] - stale Framer Motion target measurements, home route lifecycle fix, and parallax prevention checklist
- [[01 Projects/RelayClarity/Project Context]]
- [[01 Projects/RelayClarity/Architecture]]
- [[01 Projects/RelayClarity/Decisions]]

## Commands

```powershell
cd "/home/ellis/Desktop/RelayClarity"
npm run dev        # backend :8787 + Vite client :5173
npm test           # tsx --test
npm run typecheck  # tsc --noEmit
```

## Current Focus

- [ ] Reconcile and commit the substantial local changes before relying on GitHub as the latest version.
- [ ] Verify the production/Railway deployment and every auth/payment/integration claim before describing the app as shipped.
- [ ] Before more marketing-page work, apply [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]] guardrails: fix robots/sitemap/metadata, stop public auth boot calls, compress responsive images, and keep dashboard/setup code out of public route bundles.

## Last Known Development State - 2026-07-10

- Confirmed local surfaces include email/password auth, onboarding/setup, Calls, Conversations, AI Agents, Knowledge, Analytics, Integrations, Pricing, ROI Calculator, Contact Sales, checkout, profile, and launch/test flows.
- Backend includes Express, SQLite, OpenAI orchestration, ElevenLabs voice, Zoom/telephony adapters, integration adapters, and regression tests.
- Mobile Lighthouse was reported as improved from 40 to 79 on 2026-07-10; rerun before using the number externally.
- The local tree had 129 changed/untracked files at review time. These are local working changes, not evidence of a pushed or deployed release.
- Current product direction is simpler operational UI, realistic integrations, smooth setup, and evidence-led pilot-to-production delivery.

## Status Boundaries

- **Confirmed locally:** route/UI implementation and repeated build/typecheck/test/screenshot verification described in Codex sessions.
- **In progress:** shipping readiness, cleanup, commit/push discipline, production auth/payment/integration validation, performance/SEO.
- **Not confirmed:** production usage, live customer deployments, paid transactions, or scaled operational outcomes.

## AI Handoff

- Start with [[RelayClarity Memory]] before changing behavior or visual details.
- Preserve the Zoom Applied AI Engineer framing unless the user redirects the project.
- For login-field hit testing and interactive-label prevention, see [[01 Projects/RelayClarity/Incidents/RelayClarity Login Password Hit Area Incident - 2026-07-10|the login password hit-area incident]].
- Use [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]] for cross-project preferences and evidence boundaries.
