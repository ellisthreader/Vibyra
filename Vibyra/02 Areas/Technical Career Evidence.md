---
title: Technical Career Evidence
type: career-evidence
status: active
updated: 2026-07-10
source: Codex chats and project memory
confidence: medium-high
tags:
  - area/portfolio
  - career/evidence
---

# Technical Career Evidence

> [!warning] Claiming rule
> Use `built with AI-assisted development`, `designed and directed`, or `implemented in the project` unless Ellis can independently explain and reproduce the code. Do not claim production use, commercial outcomes, or manual authorship without additional evidence.

## RelayClarity - AI voice-agent deployment platform

- **Skill demonstrated:** Full-stack SaaS product design, AI/voice integration, auth, operational dashboards, performance improvement.
- **Project:** [[01 Projects/RelayClarity/RelayClarity|RelayClarity]]
- **Problem solved:** Turn a voice-agent concept into a pilot-to-production workflow with calls, conversations, agents, knowledge, integrations, tests, pricing, ROI, onboarding, and human handoff.
- **What Ellis personally implemented:** Chats strongly support product framing, workflow decisions, design direction, repeated live review, and acceptance criteria. Code was largely implemented with Codex assistance; manual line-by-line authorship is not established.
- **Technologies:** React 19, TypeScript, Vite, Express, SQLite, OpenAI SDK, ElevenLabs, Zoom/Twilio-style adapters, Remotion, Lighthouse.
- **Result/outcome:** Local builds/tests repeatedly passed. A 2026-07-10 Lighthouse pass reportedly improved mobile score from 40 to 79, LCP from 20.9s to 3.8s, and transfer size from 7.2MB to 552KB. Production deployment remains to be verified.
- **Evidence available:** Repository, tests, screenshots, [[01 Projects/RelayClarity/Architecture|architecture]], [[01 Projects/RelayClarity/Runs|run logs]], and [[RelayClarity Lighthouse Performance SEO Audit - 2026-07-07]].
- **Claim confidence:** High for project/product work; medium for individual code authorship; low until production status is verified.

## Service Priority AI - responsible public-service ML decision support

- **Skill demonstrated:** Applied ML product framing, human-in-the-loop design, FastAPI/React integration, Responsible AI, Azure MLOps communication.
- **Project:** [[01 Projects/Service Priority AI/Service Priority AI|Service Priority AI]]
- **Problem solved:** Prioritise synthetic council service requests as low/medium/high while keeping officers accountable and making model recommendations understandable.
- **What Ellis personally implemented:** Directed the employee workflow, realistic council personas, step-by-step decision support, advisory language, presentation, and interview narrative. Codex-assisted implementation is evidenced; manual authorship is not fully established.
- **Technologies:** Python, FastAPI, scikit-learn, TF-IDF, React, TypeScript, Azure ML architecture, synthetic data.
- **Result/outcome:** Project memory reports model accuracy around 0.902 and high-priority recall around 0.941 on synthetic validation data, with backend tests and a local interactive dashboard. Current cloud endpoint state must be reverified.
- **Evidence available:** Model card/docs, tests, dashboard, [[01 Projects/Service Priority AI/Azure Project/06 - Model|Model]], [[01 Projects/Service Priority AI/Azure Project/07 - Responsible-AI|Responsible AI]], and [[01 Projects/Service Priority AI/Azure Project/11 - Interview Prep|Interview Prep]].
- **Claim confidence:** High for the documented portfolio project and governance stance; medium for individual code authorship; medium-low for current Azure deployment.

## Hong Kong Express - ordering, POS, Electron, and payment hardware

- **Skill demonstrated:** Complex operational workflow design, Laravel/Inertia product development, Electron desktop delivery, checkout/POS, data seeding, payment/receipt hardware integration.
- **Project:** [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]]
- **Problem solved:** Build and refine a customer ordering journey plus staff/admin surfaces for till, kitchen, menu, deliveries, profiles, orders, and reports.
- **What Ellis personally implemented:** Directed extensive screenshot-based redesigns, menu organisation, checkout/till behavior, customer/staff separation, live operational states, Stripe reader setup, and Epson receipt behavior. Agents performed most code changes.
- **Technologies:** Laravel, PHP, Inertia.js, React, TypeScript, SQLite, Electron, Stripe Terminal S710, Epson/ESC-POS, Google Maps/Geoapify.
- **Result/outcome:** Local flows included customer/staff auth contexts, menu seed fallback, checkout/order history, responsive operational tabs, test-mode Stripe reader communication, network receipts, and QR receipts. The local worktree is far ahead of the last pushed commit and needs consolidation.
- **Evidence available:** Repository, build/test outputs, screenshots, [[01 Projects/Hong Kong Express/HKE Memory|HKE Memory]], incidents, lessons, and chat session finals from 2026-06-30 to 2026-07-05.
- **Claim confidence:** High for directing and validating the local product; medium for individual code authorship; low for production/payment-live claims.

## Vibyra - mobile/desktop AI workflow command centre

- **Skill demonstrated:** AI-agent product architecture, Electron/Windows reliability, local HTTP bridge, multi-provider terminal workflows, project memory, cross-platform design.
- **Project:** [[01 Projects/Vibyra/Vibyra|Vibyra]]
- **Problem solved:** Let a mobile app control AI software workflows on the user's own machine, including pairing, project discovery, previews, agent terminals, safe commands, and local memory.
- **What Ellis personally implemented:** Defined the product behavior, identified recurring desktop/terminal failures, requested bounded audits, reviewed outcomes, and established Obsidian memory/skills. Most code fixes were agent-assisted.
- **Technologies:** Expo, React Native, Electron, Node.js ES modules, Laravel backend, PTY/xterm, local HTTP routes, provider CLIs, Obsidian.
- **Result/outcome:** Verified Windows launcher/branding fixes, terminal input/focus fixes, provider/model updates, light/dark audits, and a bridge launch-contract fix through 2026-07-10. A large dirty worktree remains after the last pushed commit.
- **Evidence available:** [[01 Projects/Vibyra/Memory/Vibyra Desktop Memory|Vibyra Desktop Memory]], terminal notes, run logs, tests, and embedded Codex worker sessions.
- **Claim confidence:** High for product ownership/direction and debugging workflow; medium for architecture understanding; medium-low for manual code authorship.

## ClearDBS - compliant customer support experience

- **Skill demonstrated:** Laravel/Inertia UI work, support-centre UX, AI/compliance boundaries, repository/runtime diagnosis.
- **Project:** [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS]]
- **Problem solved:** Provide compact DBS help/search/chat and voice-demo pathways without implying that the assistant makes official DBS decisions.
- **What Ellis personally implemented:** Set the desired help experience, repeatedly reviewed visual behavior, and enforced the official-decision boundary. Codex created/reviewed the React components and Laravel integration.
- **Technologies:** Laravel, PHP, Inertia.js, React, Vite, SQLite, RelayClarity voice backend.
- **Result/outcome:** Local support chat, article/search flow, homepage-to-help routing, focused search, staff-author treatment, and compact responsive UI were implemented. Repository lookalike confusion became a durable incident lesson.
- **Evidence available:** [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]], component reviews, and [[01 Projects/ClearDBS/Incidents/Clear DBS Workspace Misrouting Incident Report|misrouting incident]].
- **Claim confidence:** High for product direction and local delivery; medium-low for individual code authorship; no production claim.

## Zoom CX Interview Studio - adaptive technical interview practice

- **Skill demonstrated:** Applied AI learning design, rubric-based evaluation, speech input, interactive technical diagrams, career preparation tooling.
- **Project:** [[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]]
- **Problem solved:** Convert changing interview requirements into an interactive Round 2 preparation app with questions, quizzes, readiness gating, scored typed/spoken answers, and feedback history.
- **What Ellis personally implemented:** Supplied the interview requirements, selected the content/outcomes, reviewed scoring and UX, and used the tool for preparation. Codex implemented the app.
- **Technologies:** React, Vite, Node.js, OpenAI Responses API, Web Speech API, localStorage, interactive whiteboard libraries.
- **Result/outcome:** Active local application with model scoring plus local fallback, 17 balanced quiz questions, glossary, progress, and Round 2 content.
- **Evidence available:** Local source, README, and Codex sessions from 2026-07-09 to 2026-07-10.
- **Claim confidence:** High for the functioning local tool and Ellis's requirements; low for claiming unaided implementation.

## RealEstate - property digital-twin interview demonstration

- **Skill demonstrated:** Full-stack product architecture, property customer journeys, React/TypeScript UI, API/data boundaries, 3D-tour workflow design, performance optimisation, accessibility, and evidence-led debugging.
- **Project:** [[01 Projects/RealEstate/RealEstate|RealEstate]].
- **Opportunity context:** Self-directed AI-assisted prototype that may be shown during a possible software-development interview or company conversation connected to the Gilbert & Rose domain. No employment, commission, endorsement, private integration, or production use is confirmed.
- **Problem solved:** Combine public property discovery, factual map handling, customer accounts, agent operations, capture/reconstruction foundations, and Gaussian-splat tours in one demonstrable platform.
- **What Ellis personally implemented:** Directed product scope, public-site and brand direction, screenshot-led frontend decisions, map and sign-marker requirements, loading/performance priorities, repeated live review, and acceptance criteria. Agents performed substantial code and asset implementation; unaided line-by-line authorship is not established.
- **Technologies:** React, TypeScript, Vite, TanStack Query, Leaflet, NestJS/Fastify, Prisma, PostgreSQL, Redis/BullMQ, Tauri, Swift, Python, Gaussian splats, Playwright, Vitest.
- **Result/outcome:** Local browser checks confirmed the public map, three published property markers, verified office sign, and directions popup. The representative large-image set was reduced from approximately 25.2 MB to 2.46 MB. Web tests, lint, typecheck, build, and service-backed API tests passed during the recorded work. Production deployment is not established.
- **Evidence available:** Repository, tests, browser verification, [[01 Projects/RealEstate/Frontend Context|Frontend Context]], [[01 Projects/RealEstate/Architecture|Architecture]], [[01 Projects/RealEstate/Current Status|Current Status]], and [[01 Projects/RealEstate/Interview Demo Context|Interview Demo Context]].
- **Claim confidence:** High for the functioning local prototype, product direction, and validation workflow; medium for architecture understanding; medium-low for manual code authorship; low for any production or company-use claim.

## Safe CV/interview phrasing

- `Designed and built AI-assisted full-stack prototypes across React/TypeScript, Node/Express, and Laravel.`
- `Translated customer-support, public-service, and restaurant operations into tested workflows for onboarding, calls, chat, handoff, checkout, and staff dashboards.`
- `Integrated or prototyped OpenAI, ElevenLabs, OAuth-style SaaS connectors, Stripe Terminal, and receipt hardware in local applications.`
- `Used screenshot-driven QA, regression tests, builds, endpoint probes, and Lighthouse to validate changes.`
- `Applied human-in-the-loop and synthetic-data guardrails to a public-service ML decision-support portfolio project.`

Do not use `expert`, `advanced`, `production-proven`, or `deployed at scale` without new evidence.

## Related

- [[02 Areas/Technical Skills Inventory|Technical Skills Inventory]]
- [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]]
- [[02 Areas/Portfolio and Career|Portfolio and Career]]
