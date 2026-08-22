---
title: Architecture
aliases:
  - System Architecture
  - Azure Project Architecture
tags:
  - architecture
  - system
  - service-priority-ai
project: Service Priority AI
status: active
note_type: architecture
created: 2026-06-04
updated: 2026-06-29
---

# 02 — Architecture

End-to-end flow from synthetic data to the operator dashboard.

```mermaid
flowchart LR
  A[Synthetic data<br/>ml/generate_data.py] --> B[Train pipeline<br/>ml/train_model.py]
  B --> C[Artifacts<br/>ml/artifacts/*.joblib + *.json]
  C --> D[FastAPI backend<br/>backend/app/main.py]
  D -->|/predict /chat /dashboard| E[React frontend<br/>frontend/src]
  E --> F1[Public portal<br/>pages/Home]
  E --> F2[Console dashboard<br/>pages/Dashboard]
  E --> F3[Chatbot widget<br/>chat/ChatWidget]
  C --> G[Azure ML endpoints<br/>online + batch]
  D --> H[Monitoring metrics<br/>backend/app/monitoring.py]
  H --> I[Power BI exports<br/>monitoring/powerbi]
```

## Layers
| Layer | Where | Notes |
|---|---|---|
| Data | `ml/generate_data.py`, `ml/data/synthetic_cases.csv` | 25,000 synthetic Essex-style service requests |
| Training | `ml/train_model.py` | scikit-learn pipeline → [[06 - Model]] |
| Artifacts | `ml/artifacts/` | `case_priority_model.joblib`, `evaluation.json`, `model_metadata.json`, `shap_summary.json`, `gate_summary.json`, `registry_tags.json` |
| API | `backend/app/main.py` | routes below |
| Model service | `backend/app/model_service.py` | loads joblib, predicts, explains, attributions |
| Assistant | `backend/app/chat.py` | grounded chatbot → [[05 - Chatbot]] |
| Frontend | `frontend/src/` | → [[03 - Frontend]] |
| Deployment | `azure/` | → [[08 - Azure-Deployment]] |
| Monitoring | `backend/app/monitoring.py`, `monitoring/` | → [[07 - Responsible-AI]] |

## Backend routes
- `GET /health` — model load status
- `POST /predict` — score a [[10 - Glossary|CaseRequest]]
- `POST /chat` — grounded assistant → [[05 - Chatbot]]
- `GET /metrics/summary` — live operational metrics
- `GET /model/metadata` — registry metadata
- `GET /explainability/sample` — worked example
- `GET /dashboard/summary` — aggregated panel data → [[04 - Dashboard]]

## Run locally
```bash
# backend
PYTHONPATH=. .venv/bin/uvicorn backend.app.main:app --port 8010
# frontend (dev server on :5173, CORS-allowed)
cd frontend && npm run dev
```

## Related notes

- [[12 - AI Quick Context]] - fast project brief
- [[03 - Frontend]] - React surfaces
- [[04 - Dashboard]] - operator and manager workflows
- [[05 - Chatbot]] - `/chat` assistant
- [[06 - Model]] - model artifact contract
- [[08 - Azure-Deployment]] - cloud deployment shape
- [[13 - Project Operating Memory]] - durable constraints

#servicePriorityAI #architecture
