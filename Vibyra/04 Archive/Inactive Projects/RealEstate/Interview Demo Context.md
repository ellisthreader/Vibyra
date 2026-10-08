---
title: RealEstate Interview Demo Context
type: interview-demo
project: RealEstate
status: active
opportunity_status: possible
audience: possible software-development employer
demo_status: local-live-demo
updated: 2026-07-12
tags:
  - project/realestate
  - career/interview
  - career/live-demo
  - portfolio/evidence
  - gilbert-and-rose
aliases:
  - RealEstate Live Demo Brief
  - Gilbert and Rose Interview Demo
---

# RealEstate — Interview Demo Context

> [!important] Opportunity framing
> This is a self-directed, AI-assisted portfolio and interview demonstration created around a **possible software-development opportunity** with Gilbert & Rose or a related company context. It is not evidence of confirmed employment, commissioned client work, production deployment, access to private company systems, or endorsement by the company.

## Why this project exists

The project demonstrates how Ellis can study a real organisation's public customer journey, identify practical software opportunities, turn them into a coherent full-stack prototype, and validate the result as a live local demo.

The intended interview message is:

> “I researched the public Gilbert & Rose experience and built an AI-assisted property-platform prototype to show how I think about customer journeys, operational workflows, 3D property experiences, performance, accessibility, and reliable delivery. It is a local demonstration, not a claim that the company commissioned or currently uses it.”

## Safe claim boundary

### Supported phrasing

- “I designed and directed an AI-assisted full-stack prototype.”
- “I translated public company information and property workflows into a working local demo.”
- “I iterated through screenshot review, browser verification, unit tests, linting, typechecking, builds, and endpoint checks.”
- “The prototype demonstrates how I would approach a modern property customer journey and internal operational workflow.”
- “I can explain the architecture, trade-offs, testing, current limitations, and next production steps.”

### Do not claim

- That Gilbert & Rose hired, commissioned, approved, endorsed, deployed, or uses this software.
- That the demo connects to their private CRM, customer data, listings database, staff systems, or analytics.
- That public website research is confidential company knowledge.
- That the project is production-ready, production-proven, deployed at scale, or commercially successful.
- Unaided manual authorship of all code. Use the evidence standard in [[02 Areas/Technical Career Evidence|Technical Career Evidence]].

## Live-demo story

### 1. Start with the customer problem

- Property websites often separate static listings from immersive tours.
- Customers need clear property facts even when 3D assets are loading.
- Agents need operational tools for capture, upload, processing, publishing, and tour management.
- A credible demo must include loading, empty, error, and success states—not only polished screenshots.

### 2. Show the public experience

- Gilbert & Rose-inspired homepage and service routes.
- Mobile-first navigation and accessible calls to action.
- Full-surface Leaflet property map with factual coordinate handling.
- Property details available outside the 3D viewer.
- Customer account and authentication states.

### 3. Show the differentiator

- Gaussian-splat property tours.
- Room, viewpoint, and hotspot editing.
- Capture-to-reconstruction architecture across mobile, desktop, API, worker, and web viewer.
- Processing state and idempotency principles.

### 4. Show engineering judgement

- Large image payload reduced by roughly 90% for the representative asset set.
- Critical hero preload with non-critical background cache warming.
- No fabricated map locations for properties without verified coordinates.
- Office marker uses a professional transparent estate-agent sign anchored to the verified office coordinate.
- A stuck map was traced to the unavailable API/database chain instead of incorrectly rewriting Leaflet.

### 5. Close honestly

- Identify temporary slug-based map coordinates, manual local startup, bundle-size warnings, and repository formatting drift.
- Explain the production path: persistent coordinates, deployment configuration, observability, security review, real integrations, and user acceptance testing.
- Invite discussion about what the company would prioritise rather than presenting assumptions as requirements.

## Demo readiness checklist

- [ ] Confirm Docker Desktop, PostgreSQL, Redis, API, and Vite are running using [[Runbook]].
- [ ] Confirm `http://localhost:4000/health` responds.
- [ ] Confirm `/public/properties?page=1&pageSize=100` returns published items.
- [ ] Open `/properties` and verify tiles, price markers, office sign, and popup.
- [ ] Open a property detail page and a published tour.
- [ ] Test the customer and agent journeys intended for the interview.
- [ ] Run the focused web suite and production build.
- [ ] Prepare screenshots or a short recording as an offline fallback.
- [ ] Remove or mask secrets, private paths, test credentials, and development-only controls before screen sharing.
- [ ] Rehearse a concise five-minute route and a deeper technical route.

## Connection to other interview projects

These projects demonstrate different capabilities and must retain separate evidence boundaries:

| Project | Demonstrates | Safe connection |
|---|---|---|
| RealEstate | property customer journey, digital twins, full-stack architecture, visual QA, performance | organisation-specific prototype for a possible software-development conversation |
| [[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]] | adaptive interview practice, rubric scoring, speech input, architecture communication | preparation tool for a different interview context; do not imply Zoom integration |
| [[01 Projects/Service Priority AI/Azure Project/Azure Project Home|Service Priority AI / Azure]] | applied ML, synthetic data, human-in-the-loop governance, Azure architecture | evidence of responsible decision-support thinking; do not transfer its cloud/deployment claims to RealEstate |
| [[01 Projects/RelayClarity/RelayClarity|RelayClarity]] | voice-agent deployment workflow, evaluation, handoff, operational dashboards | evidence of product and integration thinking; keep its performance and deployment evidence separate |
| [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]] | ordering, POS, checkout, Electron, payment and receipt workflows | evidence of operational UI and hardware workflow design; no connection to property data |

## Questions this demo can support

- How would you modernise an existing customer journey without losing brand identity?
- How do you decide what loads first and what can wait?
- How do you debug a UI that appears stuck?
- How do frontend, API, database, processing, desktop, mobile, and 3D components interact?
- How do you avoid misleading users when data such as coordinates or photography is missing?
- How do you use AI-assisted development responsibly while retaining architectural understanding and validation evidence?

## Canonical evidence

- Repository: `/home/ellis/Desktop/RealEstate`
- Project context: [[Project Context]]
- Frontend implementation: [[Frontend Context]]
- Architecture: [[Architecture]]
- Current verification: [[Current Status]]
- Durable decisions: [[Decisions]]
- Public-company research: [[01 Projects/Gilbert and Rose Website Research/Gilbert and Rose Website Research|Gilbert and Rose Website Research]]
- Career claim rules: [[02 Areas/Technical Career Evidence|Technical Career Evidence]]
