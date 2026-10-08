---
title: AI Quick Context
aliases:
  - Quick Context
  - AI Handoff
tags:
  - ai-context
  - service-priority-ai
  - project-memory
project: Service Priority AI
status: active
note_type: ai-context
created: 2026-06-29
updated: 2026-06-29
---

# 12 - AI Quick Context

Use this note as the first read for a new AI session working on the Azure project.

## One-screen summary

**Service Priority AI** is a public-sector AI portfolio project for fictional council case prioritisation. It predicts `low`, `medium`, or `high` priority for synthetic service requests, exposes the recommendation through FastAPI and a React dashboard, and documents Azure MLOps, monitoring, Responsible AI, and interview evidence.

The system is deliberately **advisory only**. It must never be described as deciding entitlement, replacing officers, or handling real resident data. See [[01 - Overview]], [[07 - Responsible-AI]], and [[09 - Decisions]].

## Current shape

- Product: public service portal, employee dashboard, manager MLOps assurance view, and grounded assistant. See [[03 - Frontend]] and [[04 - Dashboard]].
- Model: scikit-learn pipeline with structured features plus TF-IDF urgency text. See [[06 - Model]].
- Backend: FastAPI routes for prediction, chat, case queue, dashboard summary, monitoring, and audit. See [[02 - Architecture]].
- Chatbot: deterministic, offline, artifact-grounded `/chat`; no external LLM call. See [[05 - Chatbot]].
- Azure: Azure ML online endpoint, batch endpoint, Azure Functions browser API, static website dashboard, and durable audit pattern are documented in [[08 - Azure-Deployment]].
- Interview narrative: cloud deployment case study for Essex AI / ML Engineer. See [[11 - Interview Prep]].

## High-value links

- [[Azure Project Home]] - map of content
- [[13 - Project Operating Memory]] - constraints and operating state
- [[02 - Architecture]] - system flow and routes
- [[04 - Dashboard]] - current dashboard behavior and data sources
- [[06 - Model]] - features, metrics, and explainability
- [[08 - Azure-Deployment]] - cloud resources and deployment boundary
- [[09 - Decisions]] - rationale and non-negotiables
- [[10 - Glossary]] - terms and project vocabulary

## Claims to preserve

- Synthetic data only.
- Human officer remains accountable.
- Model output is a recommendation, not an automated decision.
- Deprivation band is service-risk context, not an eligibility decision.
- Vulnerability is a deliberate priority signal and monitored fairness cohort.
- The assistant is grounded and deterministic, not a live LLM agent.
- Cloud claims must be backed by repo artifacts, CLI output, screenshots, or endpoint responses.

## Before changing code or docs

1. Read [[13 - Project Operating Memory]] for invariants and active caveats.
2. Follow the relevant domain note from [[Azure Project Home]].
3. Check the nearby docs when needed:
   - [docs/architecture.md](../docs/architecture.md)
   - [docs/frontend-dashboard.md](../docs/frontend-dashboard.md)
   - [docs/essex-interview-prep.md](../docs/essex-interview-prep.md)
   - [AZURE_IMPLEMENTATION_PLAN.md](../AZURE_IMPLEMENTATION_PLAN.md)

#servicePriorityAI #aiContext
