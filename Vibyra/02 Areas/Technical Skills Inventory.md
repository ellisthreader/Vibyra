---
title: Technical Skills Inventory
type: skills-inventory
status: active
updated: 2026-07-10
source: Codex chats
confidence: medium-high
tags:
  - area/technical-skills
  - career/evidence
---

# Technical Skills Inventory

> [!important] Calibration
> This inventory measures demonstrated project use, not unaided coding speed. Much of the implementation was performed with Codex. `Strong` means Ellis repeatedly showed sound direction, review, and delivery judgment across projects. Technology-specific skills are generally `working knowledge` unless the chats show independent code authorship or deeper manual implementation.

## Strong skills

### AI-assisted software delivery and agent orchestration

- **Confidence:** High
- **Projects:** [[01 Projects/RelayClarity/RelayClarity|RelayClarity]], [[01 Projects/Vibyra/Vibyra|Vibyra]], [[01 Projects/Hong Kong Express/Hong Kong Express|HKE]], [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS]], [[01 Projects/Service Priority AI/Service Priority AI|Service Priority AI]]
- **Evidence:** Repeatedly decomposed broad work into audits, bounded subagent tasks, implementation passes, and verification. Examples include Vibyra Windows audits, HKE dashboard/till reviews, RelayClarity dashboard standardisation, and the 2026-07-10 all-chat memory audit.
- **Independent capability:** Can define outcomes, assign scopes, compare agent findings, demand real verification, and steer corrective iterations.
- **Needs support:** Should continue relying on code review, tests, and repository evidence for low-level correctness; agent output must not be mistaken for manual authorship.
- **Last reviewed:** 2026-07-10

### UI/UX product iteration and visual QA

- **Confidence:** High
- **Projects:** RelayClarity, HKE, ClearDBS, Service Priority AI, Zoom Interview Prep
- **Evidence:** Hundreds of screenshot- and live-page-led requests covering responsive fit, clutter reduction, consistent backgrounds, dashboard layouts, checkout, POS, modals, onboarding, pricing, ROI, auth, and profile flows. Frequently rejected visually weak states and requested fresh verification.
- **Independent capability:** Can identify hierarchy, fit, consistency, workflow, and polish problems; can articulate a target experience and iterate toward it.
- **Needs support:** Translating visual intent into robust CSS/component architecture and systematic accessibility testing.
- **Last reviewed:** 2026-07-10

### Product requirements and workflow design

- **Confidence:** High
- **Projects:** RelayClarity, HKE, Service Priority AI, ClearDBS
- **Evidence:** Defined multi-step customer and staff workflows: pilot-to-production onboarding, AI calls/conversations/handoffs, restaurant checkout/till/kitchen, public-service decision support, and support-centre search/chat.
- **Independent capability:** Can describe target users, operational steps, visible states, business outcomes, and what should be simplified or removed.
- **Needs support:** Formal acceptance criteria, edge-case matrices, data contracts, and prioritised release planning.
- **Last reviewed:** 2026-07-10

### Obsidian coding knowledge management

- **Confidence:** High
- **Projects:** All major projects
- **Evidence:** Repeatedly requested durable incident notes, project memory, read orders, decision logs, and future-agent rules; reorganised the Global vault and connected Obsidian knowledge to RelayClarity agents.
- **Independent capability:** Understands why durable memory, source boundaries, incident prevention, and concise AI context matter.
- **Needs support:** Automated link validation, periodic stale-note review, and keeping metadata/current status synchronised with repositories.
- **Last reviewed:** 2026-07-10

## Working knowledge

### React

- **Confidence:** Medium-high
- **Projects:** RelayClarity, Service Priority AI, HKE via Inertia, Vibyra mobile, Zoom Interview Prep
- **Evidence:** Repeatedly worked with React component/page structure, stateful setup flows, route-driven dashboards, modals, profiles, filters, and responsive UI; builds were repeatedly validated.
- **Independent capability:** Can reason about components, pages, state-driven workflows, visible behavior, and expected UI changes.
- **Needs support:** Hook-order rules, component decomposition, performance, accessibility, and writing/debugging complex React code without an agent.
- **Last reviewed:** 2026-07-10

### TypeScript and JavaScript

- **Confidence:** Medium
- **Projects:** RelayClarity, HKE, Vibyra, Service Priority AI
- **Evidence:** Projects use TypeScript across React/Express and JavaScript/ES modules in Vibyra; many changes were verified with `tsc`, Vite builds, and Node tests.
- **Independent capability:** Can follow typed project structure, understand build feedback, and direct changes to functions, routes, and data models.
- **Needs support:** Manual type design, async error handling, module boundaries, and diagnosing compiler/runtime errors independently.
- **Last reviewed:** 2026-07-10

### Node.js, Express, and REST-style APIs

- **Confidence:** Medium
- **Projects:** RelayClarity, Zoom Interview Prep, Vibyra desktop bridge
- **Evidence:** RelayClarity has an Express backend, SQLite, auth, AI/voice/integration endpoints and tests; Zoom Interview Prep uses a Node scoring server; Vibyra exposes local HTTP routes.
- **Independent capability:** Can reason about frontend/backend separation, endpoints, ports, health checks, request flows, and local API availability.
- **Needs support:** Endpoint implementation, middleware/security, concurrency, production operations, and API contract testing.
- **Last reviewed:** 2026-07-10

### Laravel and PHP

- **Confidence:** Medium
- **Projects:** ClearDBS, HKE, Bear Lane, Vibyra backend
- **Evidence:** Repeatedly ran Laravel apps, used Artisan/Vite workflows, worked with controllers, routes, seeders, services, migrations, auth, and PHP regression tests.
- **Independent capability:** Can navigate Laravel project concepts and specify changes across routes, UI, database, and service flows.
- **Needs support:** Writing PHP/Laravel code unaided, dependency/container details, deployment, and deeper framework conventions.
- **Last reviewed:** 2026-07-10

### Inertia.js, Vite, and Tailwind/CSS systems

- **Confidence:** Medium
- **Projects:** HKE, ClearDBS, RelayClarity, Service Priority AI
- **Evidence:** HKE/ClearDBS use Laravel + Inertia + React; all major web projects use Vite. Chats repeatedly handled Vite ports, `public/hot`, responsive Tailwind classes, CSS cascade, and builds.
- **Independent capability:** Understands the role of the asset server and can judge layout/style outcomes.
- **Needs support:** CSS architecture, cascade debugging, responsive edge cases, and Inertia lifecycle/data flow.
- **Last reviewed:** 2026-07-10

### Electron and Windows desktop applications

- **Confidence:** Medium-high
- **Projects:** Vibyra, HKE/Homegrounds
- **Evidence:** Repeated work on launchers, pinned shortcuts, app identity/icons, hidden helper windows, preload/bridge behavior, local servers, PTYs, Electron-specific customer/staff auth, and desktop visual QA.
- **Independent capability:** Can describe expected desktop behavior and diagnose whether the wrong shell/server/app identity is running.
- **Needs support:** Process lifecycle, IPC/security boundaries, packaging, code signing, installer/release engineering, and low-level PTY behavior.
- **Last reviewed:** 2026-07-10

### Git and GitHub workflow

- **Confidence:** Medium
- **Projects:** All repository-backed projects
- **Evidence:** Repeated clone, pull, branch, remote, commit, push, and clean-worktree checks. GitHub source-of-truth mistakes were identified and documented.
- **Independent capability:** Understands repositories, remotes, branches, pushed versus local state, and why a clean/correct checkout matters.
- **Needs support:** CLI syntax, conflict resolution, commit hygiene across very large dirty worktrees, PR review, and release branching.
- **Last reviewed:** 2026-07-10

### SQLite and application data modelling

- **Confidence:** Medium
- **Projects:** RelayClarity, ClearDBS, HKE, Bear Lane
- **Evidence:** Local SQLite use, seed data, migrations, model relationships, menu/catalog fallbacks, auth/session data, customer orders, and audit records appear repeatedly.
- **Independent capability:** Can identify when runtime database state differs from seed/source data and specify expected records and relationships.
- **Needs support:** Schema design trade-offs, migrations in production, query optimisation, transactions, backups, and database security.
- **Last reviewed:** 2026-07-10

### Authentication and role-aware application flows

- **Confidence:** Medium
- **Projects:** RelayClarity, HKE, Vibyra, ClearDBS
- **Evidence:** RelayClarity email/password auth with hashed passwords and sessions; HKE separates customer and staff login contexts and customer order/profile data; Vibyra uses pairing/bearer-token routes.
- **Independent capability:** Can define login/signup/reset/profile and user-role behavior and recognise broken routing/session UX.
- **Needs support:** Threat modelling, session hardening, CSRF/CORS details, credential storage, account recovery, SSO, and production security review.
- **Last reviewed:** 2026-07-10

### Testing, regression checks, and evidence-based verification

- **Confidence:** Medium-high
- **Projects:** RelayClarity, HKE, Vibyra, Service Priority AI
- **Evidence:** Repeated use of typecheck/build, Node tests, PHP tests, targeted regression files, route probes, endpoint checks, screenshots, and Lighthouse. Requested durable tests after recurring bugs.
- **Independent capability:** Understands that completion needs behavioral evidence and can request appropriate build/live/screenshot checks.
- **Needs support:** Designing comprehensive automated coverage, mocking, CI integration, flaky-test diagnosis, and selecting risk-proportionate suites independently.
- **Last reviewed:** 2026-07-10

### OpenAI API and LLM application integration

- **Confidence:** Medium
- **Projects:** RelayClarity, Zoom Interview Prep, ClearDBS-related support work
- **Evidence:** RelayClarity uses the OpenAI SDK and AI orchestration; Zoom Interview Prep uses the Responses API for structured interview scoring with a local fallback; chats discuss cost-aware model selection and secret handling.
- **Independent capability:** Can frame an LLM feature, scoring rubric, fallback behavior, cost concern, and business outcome.
- **Needs support:** Prompt/version evaluation, structured outputs, rate limits, production observability, secure key management, and model selection based on current official evidence.
- **Last reviewed:** 2026-07-10

### Voice AI and ElevenLabs

- **Confidence:** Medium
- **Projects:** RelayClarity, ClearDBS voice demo, Vibyra voice input
- **Evidence:** Voice selection/pre-generated samples, ElevenLabs synthesis and tests, phone-call demo flows, speech transcription, and voice-agent latency/handoff concerns were implemented or reviewed.
- **Independent capability:** Can define voice UX, test expected playback, and connect the feature to customer-support workflows.
- **Needs support:** Telephony production architecture, latency budgets, streaming, consent, call recording, carrier behavior, and operational monitoring.
- **Last reviewed:** 2026-07-10

### Responsible AI and human-in-the-loop design

- **Confidence:** Medium-high
- **Projects:** Service Priority AI, ClearDBS, RelayClarity
- **Evidence:** Consistently preserved advisory-only decisions, synthetic data, human overrides, uncertainty, escalation, evidence/guardrails, and avoidance of official DBS decisions.
- **Independent capability:** Can identify when an AI system should advise, clarify, or hand off instead of acting autonomously.
- **Needs support:** Formal governance frameworks, legal/regulatory review, quantitative fairness evaluation, DPIAs, and production audit controls.
- **Last reviewed:** 2026-07-10

### SaaS product development

- **Confidence:** Medium-high
- **Projects:** RelayClarity, Vibyra
- **Evidence:** Pricing, checkout, auth, onboarding, workspaces, agents, integrations, billing/profile, operational dashboards, launch gates, and pilot-to-production workflows.
- **Independent capability:** Can shape a multi-surface SaaS product and prioritise user-facing workflow improvements.
- **Needs support:** Market validation, production billing, tenancy/isolation, analytics, support operations, and release management.
- **Last reviewed:** 2026-07-10

## Currently learning

### RAG and retrieval quality

- **Confidence:** Medium-low
- **Projects:** Zoom Interview Prep, RelayClarity Obsidian knowledge, ClearDBS support planning
- **Evidence:** Interview prep covers ingestion, chunking, embeddings, hybrid retrieval, reranking, metadata/permission filters, citations, and retrieval-vs-generation evaluation. RelayClarity performs vault-backed Markdown retrieval.
- **Independent capability:** Can explain the conceptual pipeline and the need for grounding, permissions, weak-evidence fallback, and separate retrieval evaluation.
- **Needs support:** Implementing and benchmarking a production vector/hybrid retrieval system with real datasets.
- **Last reviewed:** 2026-07-10

### Azure, Azure ML, and cloud deployment

- **Confidence:** Medium-low
- **Projects:** Service Priority AI
- **Evidence:** Project documents Azure ML endpoints, Functions, Blob/SQL/Table Storage, monitoring, model evaluation, and a cloud interview narrative. Current notes explicitly require fresh endpoint/artifact verification.
- **Independent capability:** Can discuss the intended MLOps architecture and responsible deployment boundary.
- **Needs support:** Reproducing the deployment unaided, current cloud-state verification, IAM/networking, IaC, cost control, and production incident handling.
- **Last reviewed:** 2026-07-10

### OAuth and third-party integration architecture

- **Confidence:** Medium-low
- **Projects:** RelayClarity
- **Evidence:** Asked how real company data would be connected; project added OAuth/config support across CRM, support, calendar, commerce, analytics, and collaboration providers.
- **Independent capability:** Understands the distinction between OAuth, API keys, scopes, connection status, and user-visible setup.
- **Needs support:** Provider-specific authorization-code flows, refresh tokens, webhooks, least privilege, tenant isolation, and production connector maintenance.
- **Last reviewed:** 2026-07-10

### Stripe Terminal, payments, and receipt hardware

- **Confidence:** Medium-low
- **Projects:** HKE
- **Evidence:** Worked through Stripe S710 registration/sandbox behavior, real-card rejection in test mode, till checkout, Epson network printing, ESC/POS receipts, and QR receipts.
- **Independent capability:** Can follow hardware setup, recognise test/live mode boundaries, and define the till-to-receipt workflow.
- **Needs support:** Live-mode readiness, PCI scope, refunds, idempotency, terminal fleet management, webhook reconciliation, and production failure recovery.
- **Last reviewed:** 2026-07-10

### Security hardening

- **Confidence:** Medium-low
- **Projects:** RelayClarity, Vibyra, HKE, Service Priority AI
- **Evidence:** Auth hashing/sessions, pairing tokens, prompt-injection trust prompts, scoped permissions, human handoff, secret redaction, and security audits were discussed or implemented.
- **Independent capability:** Recognises secrets, role boundaries, scoped permissions, and the need for explicit trust/security review.
- **Needs support:** Systematic threat modelling, OWASP testing, secure deployment, dependency risk, key rotation, logging/privacy, and security ownership.
- **Last reviewed:** 2026-07-10

### Performance, SEO, and observability

- **Confidence:** Medium
- **Projects:** RelayClarity
- **Evidence:** Used Lighthouse to audit the whole site; mobile performance reportedly improved from 40 to 79, with LCP 20.9s to 3.8s and transfer size 7.2MB to 552KB. Existing audit records route splitting, metadata, responsive images, and public auth-call issues.
- **Independent capability:** Can identify user-visible performance problems and read major Lighthouse metrics.
- **Needs support:** Repeatable budgets, bundle analysis, RUM/APM, server tracing, caching/CDN strategy, and sustained regression prevention.
- **Last reviewed:** 2026-07-10

### Linux and cross-platform desktop delivery

- **Confidence:** Low-medium
- **Projects:** Vibyra
- **Evidence:** Audited Linux responsibilities while building a Windows second-app port and preserving UI parity.
- **Independent capability:** Understands that scripts, process control, paths, PTYs, icons, and launchers differ by platform.
- **Needs support:** Shell scripting, Linux packaging/services, permissions, desktop integration, and cross-platform CI.
- **Last reviewed:** 2026-07-10

## Limited exposure

### Docker

- **Confidence:** Low
- **Projects:** ClearDBS/Bear Lane environment history
- **Evidence:** Docker/Sail was discussed, but ClearDBS's durable rule is to run natively instead. No strong evidence of successful container design or operations.
- **Independent capability:** Understands that Docker is an alternative runtime approach.
- **Needs support:** Dockerfiles, Compose, volumes, networking, security, and production container workflows.
- **Last reviewed:** 2026-07-10

### MySQL

- **Confidence:** Low
- **Projects:** Mentioned in repository/config context only
- **Evidence:** Insufficient implementation evidence; active local projects mostly use SQLite.
- **Independent capability:** Not confidently established.
- **Needs support:** Schema/query work, administration, migrations, performance, and backups.
- **Last reviewed:** 2026-07-10

### Twilio production integration

- **Confidence:** Low
- **Projects:** RelayClarity
- **Evidence:** Twilio configuration/telephony adapter context exists, but the chats do not establish a verified production deployment.
- **Independent capability:** Can discuss Twilio as a telephony provider in the voice-agent architecture.
- **Needs support:** Number provisioning, call control, webhooks, media streaming, compliance, cost, and production troubleshooting.
- **Last reviewed:** 2026-07-10

### React Native and Expo

- **Confidence:** Low-medium
- **Projects:** Vibyra
- **Evidence:** Vibyra's mobile app uses Expo/React Native and Ellis directs mobile/desktop workflows, but this chat window is dominated by desktop work rather than hands-on mobile implementation.
- **Independent capability:** Understands Vibyra's mobile-command-centre purpose and paired desktop workflow.
- **Needs support:** Native mobile components, navigation, build/release, device APIs, performance, and app-store delivery.
- **Last reviewed:** 2026-07-10

### Claude API

- **Confidence:** Low
- **Projects:** Vibyra provider terminals
- **Evidence:** Claude CLI account/authentication was configured and debugged. No meaningful evidence of a direct Claude API product integration.
- **Independent capability:** Can distinguish CLI account access from API-key access.
- **Needs support:** API integration, model selection, structured tool use, billing, and production evaluation.
- **Last reviewed:** 2026-07-10

## Related

- [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]]
- [[02 Areas/Technical Career Evidence|Technical Career Evidence]]
- [[02 Areas/Portfolio and Career|Portfolio and Career]]
- [[99 Meta/Codex Chat Memory Audit - 2026-07-10|Codex Chat Memory Audit]]

