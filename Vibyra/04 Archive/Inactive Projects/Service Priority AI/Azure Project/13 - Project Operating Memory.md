---
title: Project Operating Memory
aliases:
  - Operating Memory
  - Project Memory
tags:
  - project-memory
  - operating-context
  - service-priority-ai
project: Service Priority AI
status: active
note_type: operating-memory
created: 2026-06-29
updated: 2026-07-07
---

# 13 - Project Operating Memory

Durable project memory for future AI and human sessions. Keep this note factual and update it when project behavior, cloud evidence, or presentation claims change.

## Non-negotiables

- Keep the demo synthetic. Do not imply real resident deployment or real resident performance.
- Keep the model advisory. Officers make final decisions and can override.
- Do not add dashboard assistant surfaces. The dashboard route should remain free of floating chat, assistant rail, or top-nav assistant controls; see [[04 - Dashboard]].
- Do not move model logic into the frontend. The API and model service own scoring and explanation.
- Do not claim Responsible AI scorecard, Power BI publishing, Entra/APIM controls, or production hardening unless current evidence confirms it. See [[08 - Azure-Deployment]] and [[11 - Interview Prep]].

## Current implementation memory

- Frontend is React 19 + Vite + TypeScript with hash routing. The public home route has the chatbot; the dashboard route is an employee action workspace. See [[03 - Frontend]].
- Dashboard casework is centered on the selected case record, queue, officer assignment, evidence previews, notes, and audit decisions. Manager MLOps assurance is grouped under the MLOps tab. See [[04 - Dashboard]].
- Backend exposes prediction, chat, metrics, dashboard summary, case queue, source/evidence detail, audit, feedback, and drift endpoints. See [[02 - Architecture]].
- Model is `service-priority-ai-baseline` v0.1.0 with accuracy about 0.9020 and high-priority recall about 0.9408 on synthetic validation data. See [[06 - Model]].
- Chatbot is keyword-routed over artifacts and can triage the current case context through the model service. See [[05 - Chatbot]].
- Azure demo status and verified resource names are recorded in [[08 - Azure-Deployment]]; interview evidence requirements are in [[11 - Interview Prep]].

## Recent decision-support UX context

- User prefers a simple employee decision-support workflow over a raw ML analytics page.
- The main flow should be step-by-step with back/next controls, not a long page of all fields.
- Do not prefill forms when the user is meant to enter new operational information.
- If service type, service subtype, or district are unclear, the UI should ask for clarification in plain language.
- The decision-support title can split across lines for readability, for example `Decision` then `Support`.
- Seed realistic Essex County Council staff profiles and job titles, with dashboard context changing by profile. Keep profile switching simple.
- Do not record raw secrets from chat transcripts. A recent prompt included an OpenAI API key; treat it as exposed and never copy it into notes or examples.

## Known Local Demo Fixes

> [!bug] `Failed to fetch` after pressing Continue on Add information
> Root cause: the frontend can be served from different Vite ports/origins (`5173+`, including LAN origins such as `172.x.x.x`), while the backend CORS policy used to allow only a small localhost set. The active `frontend/.env` also used `http://localhost:8010`, which can resolve to IPv6 on Windows while local Uvicorn commonly listens on IPv4.
>
> Fix: `frontend/src/api.ts` normalises configured local API URLs from `localhost` to `127.0.0.1`; `frontend/.env` and `.env.example` use `http://127.0.0.1:8010`; `backend/app/main.py` allows local/LAN Vite origins on ports `5170-5179`.

## AI session checklist

- Start from [[12 - AI Quick Context]] and [[Azure Project Home]].
- Use [[09 - Decisions]] before changing architecture, assistant behavior, governance stance, or UI scope.
- Use [[10 - Glossary]] for consistent terminology.
- For presentation work, verify every cloud and incident claim against [[11 - Interview Prep]] and current artifacts.
- For UI work, keep the first screen practical and operational; avoid marketing hero patterns for the dashboard.
- For governance work, preserve clear human accountability and uncertainty about synthetic-data generalisation.

## Evidence map

| Topic | Primary vault note | Supporting docs |
|---|---|---|
| Architecture | [[02 - Architecture]] | [docs/architecture.md](../docs/architecture.md) |
| Frontend | [[03 - Frontend]] | [docs/frontend-dashboard.md](../docs/frontend-dashboard.md) |
| Dashboard | [[04 - Dashboard]] | [docs/frontend-dashboard.md](../docs/frontend-dashboard.md) |
| Chatbot | [[05 - Chatbot]] | [[09 - Decisions]] |
| Model | [[06 - Model]] | [docs/model-card.md](../docs/model-card.md), [docs/modeling-approach.md](../docs/modeling-approach.md) |
| Responsible AI | [[07 - Responsible-AI]] | [docs/responsible-ai-assessment.md](../docs/responsible-ai-assessment.md), [docs/dpia-lite.md](../docs/dpia-lite.md) |
| Azure deployment | [[08 - Azure-Deployment]] | [AZURE_IMPLEMENTATION_PLAN.md](../AZURE_IMPLEMENTATION_PLAN.md) |
| Interview | [[11 - Interview Prep]] | [docs/essex-interview-prep.md](../docs/essex-interview-prep.md) |

## Open verification prompts

- Does the Azure Function `/health` still report model loaded?
- Does `/audit/summary` report durable Azure Table Storage mode in the deployed Function App?
- Are screenshots and CLI outputs current enough for the interview deck?
- Do backend tests, frontend build, local scoring, and Power BI export still pass after any material change?

#servicePriorityAI #projectMemory
