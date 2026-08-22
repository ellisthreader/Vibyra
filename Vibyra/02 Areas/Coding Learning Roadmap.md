---
title: Coding Learning Roadmap
type: learning-roadmap
status: active
updated: 2026-07-10
source: Technical Skills Inventory and Codex chats
confidence: medium-high
tags:
  - area/learning
  - coding-memory
---

# Coding Learning Roadmap

## Highest-value next steps

### 1. Make one project reproducible without agent help

Use [[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]] or a small RelayClarity slice. From a clean clone, explain the architecture, install it, run it, make one change, write one test, and debug one failure manually.

**Evidence to capture:** commands used, a short architecture diagram, a commit authored by Ellis, test output, and a written explanation of the change.

### 2. Consolidate Git and release discipline

Major repositories currently have large dirty worktrees. Practise small commits, feature branches, pull requests, conflict resolution, and tagged release baselines.

**Evidence to capture:** clean `git status`, grouped commits, PR description, review response, and rollback plan.

### 3. Deepen TypeScript/React and API fundamentals

Focus on component boundaries, hooks, async state, schemas, error handling, accessibility, and client/server contracts.

**Evidence to capture:** refactor a large component, add typed API schemas, write component/API tests, and explain why the hook-order and state design are correct.

### 4. Build one production-shaped AI integration

Choose a narrow RAG or scoring workflow. Add evaluation data, structured outputs, tracing, rate limits, caching, cost metrics, weak-evidence fallback, and secret rotation.

**Evidence to capture:** eval set, retrieval/generation metrics, failure examples, cost/latency report, and a threat model.

### 5. Verify a cloud deployment end to end

Use Service Priority AI or Zoom Interview Prep. Deploy from a clean repository with repeatable configuration, least-privilege secrets, logs, health checks, and a documented teardown/cost plan.

**Evidence to capture:** current endpoint, deployment commands/IaC, monitoring screenshot, security boundary, and a reproducible redeploy.

## Secondary learning tracks

- OAuth authorization-code flows, refresh tokens, scopes, and webhook verification.
- Stripe Terminal live-readiness concepts: idempotency, webhooks, refunds, reconciliation, and PCI boundaries.
- Linux packaging/process management for Vibyra cross-platform support.
- Automated accessibility and visual regression testing.
- SQL schema/query design beyond local SQLite demos.

## Related

- [[02 Areas/Technical Skills Inventory|Technical Skills Inventory]]
- [[02 Areas/Technical Career Evidence|Technical Career Evidence]]
- [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]]

