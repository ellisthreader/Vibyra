---
type: project
status: active
priority: 1
stack:
  - Python
  - FastAPI
  - React
  - Azure ML
  - scikit-learn
project_path: C:\Users\Ellis\Desktop\Projects\azure project
repository: C:\Users\Ellis\Desktop\Projects\azure project
memory_home: 01 Projects/Service Priority AI/Azure Project/Home
last_commit: 2026-06-28
next_action: Consolidate the local worktree and reverify model, tests, frontend build, and live Azure evidence before portfolio use
tags:
  - project/service-priority-ai
  - area/portfolio
  - azure
---

# Service Priority AI

End-to-end Azure MLOps and Responsible AI portfolio project for service-request triage.

## Project Record

- **Target users:** Council officers reviewing service requests, managers monitoring model/service performance, and interview/portfolio reviewers.
- **Status:** Active portfolio project; current cloud deployment state requires verification.
- **Architecture:** React/TypeScript frontend -> FastAPI backend -> scikit-learn pipeline and artifacts; documented Azure ML/Functions/storage/monitoring boundary.
- **Authentication:** No production identity/access claim should be made without fresh evidence; Entra/APIM controls are documented aspirations/architecture unless verified.
- **Database/data:** Synthetic case data only. Project docs reference Azure/local storage patterns and audit records; do not imply real resident data.
- **Important files:** `frontend/src/pages/Dashboard.tsx`, `frontend/src/api.ts`, `backend/app/main.py`, `backend/app/schemas.py`, `backend/app/model_service.py`, `ml/`, `docs/`.
- **Confirmed local features:** Public portal, employee decision support, case queue, prediction/explanation, deterministic grounded chat, metrics/audit/drift endpoints, role-aware personas, tests, and interview presentation material.
- **In progress/planned:** Clean worktree, revalidated metrics, current Azure endpoint proof, production IAM/networking/monitoring, and stronger automated frontend coverage.
- **Skills evidenced:** Python/FastAPI/React exposure, ML product framing, Responsible AI, synthetic-data design, human-in-loop workflow, Azure MLOps concepts.
- **Source window:** Codex sessions 2026-06-27 to 2026-06-30; repository state checked 2026-07-10.

## System Links

- [[01 Projects/Projects|Projects]]
- [[02 Areas/Portfolio and Career|Portfolio and Career]]
- [[02 Areas/Project Maintenance|Project Maintenance]]
- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[03 Resources/Development Commands|Development Commands]]
- [[01 Projects/Service Priority AI/Azure Project/Azure Project Home|Azure Project Home]]
- [[01 Projects/Service Priority AI/Azure Project/12 - AI Quick Context|AI Quick Context]]
- [[01 Projects/Service Priority AI/Azure Project/13 - Project Operating Memory|Project Operating Memory]]
- [[01 Projects/Service Priority AI/Azure Project/README|Consolidated Project README]]

## Links

- Project folder: `C:\Users\Ellis\Desktop\Projects\azure project`
- Memory folder: `C:\Users\Ellis\Documents\Global\01 Projects\Service Priority AI\Azure Project`
- [[01 Projects/Service Priority AI/Azure Project/01 - Overview|Project Overview]]
- [[01 Projects/Service Priority AI/Azure Project/02 - Architecture|Architecture]]
- [[01 Projects/Service Priority AI/Azure Project/09 - Decisions|Decisions]]

## Next

- [ ] Review the 77-file dirty worktree and make a clean portfolio baseline.
- [ ] Reverify local tests/build and every current Azure endpoint/resource claim.
- [ ] Keep stable project decisions in [[01 Projects/Service Priority AI/Azure Project/09 - Decisions|Decisions]].
- [ ] Keep operating constraints in [[01 Projects/Service Priority AI/Azure Project/13 - Project Operating Memory|Project Operating Memory]].
- [ ] Keep presentation/interview evidence in [[01 Projects/Service Priority AI/Azure Project/11 - Interview Prep|Interview Prep]].

## AI Handoff

Start with [[01 Projects/Service Priority AI/Azure Project/12 - AI Quick Context|AI Quick Context]], then read [[01 Projects/Service Priority AI/Azure Project/13 - Project Operating Memory|Project Operating Memory]]. Only then inspect source files under `C:\Users\Ellis\Desktop\Projects\azure project`.

Keep portfolio-facing claims aligned with working validation evidence.

## Last Known Development State - 2026-07-10

- Active portfolio project, with the latest concentrated work on 2026-06-28 to 2026-06-30.
- Confirmed project shape: FastAPI backend, React/TypeScript dashboard, scikit-learn model, deterministic grounded assistant, synthetic data, Responsible AI documentation, and employee decision-support flow.
- The project memory reports accuracy about 0.902 and high-priority recall about 0.941 on synthetic validation data. Re-run before external use.
- Staff review and final decision remain mandatory. Extraction, field review, prediction, and final decision are separate conceptual stages.
- Current Azure deployment/resource status is not confidently established by this audit; follow the evidence checklist before claiming a live cloud deployment.
