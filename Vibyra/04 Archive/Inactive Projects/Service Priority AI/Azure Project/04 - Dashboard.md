---
title: Dashboard
aliases:
  - Operator Dashboard
  - Employee Dashboard
  - Manager MLOps Assurance
tags:
  - frontend
  - dashboard
  - monitoring
  - service-priority-ai
project: Service Priority AI
status: active
note_type: implementation
created: 2026-06-04
updated: 2026-06-29
---

# 04 — Dashboard

The operator console (`pages/Dashboard.tsx`) uses a dedicated **employee action workspace**: Essex logo sidebar, simple left navigation, and one focused casework area. All live data comes from the backend with a static fallback so it renders offline.

## Panels and their data sources
| Panel | Component | Source |
|---|---|---|
| Today's priority list | `pages/Dashboard.tsx` | `GET /cases/queue` |
| **Case details** (plain record view: summary, ownership, variables, evidence, notes, next action, add-update form, recent activity) | `dashboard/TriageForm.tsx` | `GET /cases/queue` |
| Manager MLOps assurance | `pages/Dashboard.tsx` | `GET /dashboard/summary` |

## Behaviour notes
- The dashboard route owns its full-height shell. `main.tsx` renders the public Essex top nav only on the home route, so the dashboard does not have two competing navigation systems.
- Desktop uses one employee sidebar as primary navigation. Mobile hides the sidebar and shows a compact tab block.
- Tabs: Case details, Today, and MLOps. The employee dashboard opens on the selected case details by default; the priority list remains available from Today. Detailed monitoring, platform, governance evidence, and model-registry details stay out of the officer flow and are grouped in the manager-only MLOps parent tab.
- The MLOps parent expands a left-sidebar subnav on desktop: Overview, Database, Azure delivery, Model evidence, Monitoring, and Governance. Mobile shows the same sections as compact horizontal tabs inside the MLOps page. Each subpage renders inside one simple manager workspace box, with plain row lists and short summaries rather than stacked KPI cards or a dense all-in-one panel grid.
- Desktop MLOps subpages are one-screen summaries by design: Database, Azure delivery, Monitoring, Governance, and Model evidence show only the most important rows so managers do not need to scroll within those pages. Detailed evidence remains available through the underlying `/dashboard/summary` data and supporting docs rather than expanding the UI vertically.
- Manager MLOps pages use compact visual summaries: readiness/progress bars for deployment, quality, governance, fairness, and audit rates; a simple daily volume bar chart for monitoring; and in-page manager action buttons that switch to the relevant assurance section.
- The MLOps Overview is a simplified manager status page: it shows live refresh status, key assurance metrics, readiness bars, and quick links into Azure/model/monitoring/governance sections. Upload selection lives in the MLOps Database subtab, which shows current sources, total records, cleaned records, cleaning process state, and local demo upload state.
- The Governance MLOps section includes an access matrix: what managers can inspect inside the dashboard versus what requires live Azure ML Studio, Azure Monitor/Application Insights, Power BI workspace, Entra, or audit storage access.
- The MLOps tab polls `GET /dashboard/summary` every 30 seconds with `fallbackDashboard` as the offline fallback. It surfaces Azure ML pipeline, endpoint/deployment status, registry metrics, Power BI monitoring signals, fairness slices, explanation factors, batch scoring preview, audit summary KPIs, and Responsible AI / Information Governance evidence. Relevant files: `frontend/src/pages/Dashboard.tsx`, `frontend/src/api.ts`, `backend/app/main.py`.
- The case details page should stay visually simple: one record surface, section dividers, plain variable rows, simple evidence/notes lists, and a local add-update form. Avoid reintroducing multiple card styles or model/system-flag panels into this workflow.
- The case details record now uses a task-first tabbed structure: the header stays visible, Overview contains the summary, assignment/update actions, and compact key details with secondary data behind “More case data”; Evidence, Notes, and Updates are separate simple tabs. Relevant files: `frontend/src/dashboard/TriageForm.tsx`, `frontend/src/styles/dashboard.css`.
- Case record source rows are intentionally inspectable in-place: Evidence tab rows open an evidence preview drawer with full-size photos or document/note details, and Notes tab rows open the existing message preview drawer for Outlook, Teams, SharePoint, and previous contact content.
- Microsoft 365 source previews now load through backend detail endpoints before falling back to local synthetic content: `GET /cases/{case_id}/sources/{source_id}` and `GET /cases/{case_id}/evidence/{evidence_id}`. Live Graph mode requires `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, plus per-item Graph IDs. Setup notes live in `docs/microsoft-365-integration.md`.
- In-site Microsoft 365 rendering supports Graph message bodies plus proxied images, PDFs, and text-like files. Raw Word/PowerPoint/Excel files require Office web embed or server-side conversion before they can be previewed inside the website. `GET /m365/status` diagnoses tenant licensing and Graph permission blockers.
- Microsoft 365 is incorporated as case context, not app navigation: the queue summarizes linked Outlook/Teams/SharePoint items, and the case review opens case notes and previous contacts in an in-page source preview drawer. The drawer also offers an optional “Open in Microsoft 365” app-shell launch; true record deep-links would require tenant auth, Graph permissions, and real item IDs. Housing fire-risk evidence uses generated project assets in `frontend/public/case-evidence/`.
- Staff ownership is synthetic: `GET /cases/queue` includes fake employees, generated avatar assets in `frontend/public/staff/`, usernames under `@essex.example`, case status, assigned officer, and recent activity so the UI shows who is working on what without representing real council staff.
- `caseInput` / `prediction` are **lifted to `main.tsx`** so the chatbot's "triage my current case" scores the exact case shown in the form.
- `Badge` auto-colours by status text (`pass/ready/complete` → green, `requires` → amber).
- Fallback case queue lives in `api.ts` (`fallbackCaseQueue`) — keeps the case UI usable when the API is down.
- The dashboard polls `/cases/queue` every 15 seconds for officer workflow data and `/dashboard/summary` every 30 seconds for manager MLOps assurance data, so it recovers when the FastAPI backend starts after the frontend while retaining static fallbacks.
- `GET /cases/queue` now applies a restrained synthetic live feed from backend server uptime: one queue change about every 5 seconds in the local demo, including new visible cases, status changes, activity notes, and staff assignments. Manual `assign-to-self` choices still override the synthetic assignment for that case. Relevant files: `backend/app/main.py`, `frontend/src/pages/Dashboard.tsx`.
- Loop cases are enriched by backend account context before being returned to the UI: each case has realistic synthetic evidence, notes, previous contacts, and source apps across Outlook, Teams, SharePoint, Case portal, and Phone. The data is plausible demo account history, not real resident data. Relevant files: `backend/app/main.py`, `backend/app/schemas.py`, `frontend/src/dashboard/TriageForm.tsx`.
- Every case card should have previewable synthetic evidence context: non-empty evidence items, case notes, previous contacts, and image assets for photo evidence. Regression coverage lives in `backend/tests/test_api.py`; current generated evidence images live in `frontend/public/case-evidence/highways-road-defect-photo.png` and `frontend/public/case-evidence/waste-collection-point-photo.png`.
- The first dashboard viewport is only today's priority list.
- The employee workflow is backend-shaped rather than frontend-only: `GET /cases/queue` returns synthetic cases with pre-attached system flags, selecting a case opens a read-only review view, and `POST /cases/{case_id}/decision` returns an audit receipt for the officer's final priority and override state. After a decision is saved, the dashboard refreshes `/audit/summary` so the visible audit counts update.
- Today's queue supports unassigned work: `CaseRecord.assigned_to` may be `null`, the dashboard shows unassigned counts, and `POST /cases/{case_id}/assign-to-self` assigns the selected item to the signed-in staff profile. Relevant files: `backend/app/schemas.py`, `backend/app/main.py`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/dashboard/TriageForm.tsx`.
- The demo has a lightweight local sign-in profile. The frontend stores the active staff profile in `localStorage`, shows the signed-in user in the sidebar/top bar, and sends that `StaffMember` as the body to `POST /cases/{case_id}/assign-to-self`; the backend records that exact profile on the case. The professional avatar asset lives at `frontend/public/staff/demo-officer-profile.png`.
- The dashboard must have no extra assistant surfaces. `main.tsx` renders `ChatWidget` on the home route only; the dashboard route has no floating chat, assistant rail, or top-nav assistant button.

See [[05 - Chatbot]] and [[03 - Frontend]].

## Related notes

- [[03 - Frontend]] - shell, routing, state ownership
- [[02 - Architecture]] - dashboard API sources
- [[06 - Model]] - scoring and explainability evidence
- [[07 - Responsible-AI]] - human review and governance stance
- [[08 - Azure-Deployment]] - deployed dashboard/API claims
- [[13 - Project Operating Memory]] - dashboard invariants

#servicePriorityAI #dashboard
