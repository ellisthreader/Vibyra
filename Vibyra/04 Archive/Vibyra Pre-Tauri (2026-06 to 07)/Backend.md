---
title: Backend Index
tags:
  - ai/backend
  - index
status: active
scope: Backend
---

# Backend

## AI quick context

Backend notes describe the Laravel/API side of Vibyra: auth/session state, cloud sync, billing and credit enforcement, chat/provider cost controls, public community publishing, hosted demos, Railway runtime deployment, and desktop-agent bridge routes. Start here when deciding which backend contract owns a product behavior before editing code.

## Primary notes

- [[Chat And Cost Controls]] - `/api/chat`, streaming, skills, model routing, OpenRouter payloads, learning memory, and credit reservations.
- [[Billing Credits And Levels]] - plan source of truth, Stripe/IAP/topups, referrals, ledger behavior, plan caps, and XP/levels.
- [[Auth And Cloud Sync]] - bearer sessions, account devices, provider auth, session lifecycle, and mobile cloud/project-memory sync.
- [[Community Publishing]] - published project lifecycle, review authority, safety review, comments/reactions, and generated assets.
- [[Hosted Demos]] - current hosted/static demo contract, Railway worker behavior, release/candidate states, and public demo URL rules.
- [[Railway Cloud Runtime]] - deep product/spec history for Railway-backed interactive demo hosting and scale model.
- [[Desktop Agent Backend]] - desktop-agent backend route shape, locks, and stale-run behavior.
- [[Team Planning]] - backend-facing Team planner endpoint and route contract.

## Decisions surfaced

- [[Railway Cloud Runtime]] decides Railway is the runtime provider, while static hosted artifacts remain the cheap/default Explore demo path.
- [[Hosted Demos]] separates current openable release from latest candidate attempt so failed redeploys do not break Explore.
- [[Chat And Cost Controls]] makes backend reservations and actual-cost settlement the enforcement boundary for chat, stream, research, image, and terminal spend.
- [[Community Publishing]] keeps deterministic safety review authoritative, with temporary force approval documented as a testing flag that must be disabled after testing.

## Open todos and watchpoints

- [[Hosted Demos#Open Launch Blockers]] - launch blockers for hosted demo release.
- [[Railway Cloud Runtime#Open Questions]] - unresolved UX/runtime questions for public demos.
- [[Chat And Cost Controls#Remaining Economics Work]] - chargeback/refund, Play verification, and concurrency load-testing work.
- [[Billing Credits And Levels#Billing Source Of Truth]] - run `vibyra:audit-billing-economics` before plan, cap, price, VAT, FX, top-up, or reserve changes.

## Related Desktop notes

- [[AI Terminals]] - desktop terminal runtime, managed provider routing, and local Responses gateway.
- [[Projects And Preview]] - source of publish bundles, preview capability URLs, and desktop project/runtime detection.
- [[Voice And Project Memory]] - project-memory surfaces that sync through backend project-memory endpoints.
