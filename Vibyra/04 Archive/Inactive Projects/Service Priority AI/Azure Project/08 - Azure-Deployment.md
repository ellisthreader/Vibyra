---
title: Azure Deployment
aliases:
  - Azure-Deployment
  - Azure MLOps
  - Cloud Deployment
tags:
  - azure
  - deployment
  - mlops
  - service-priority-ai
project: Service Priority AI
status: active
note_type: deployment
created: 2026-06-04
updated: 2026-06-29
---

# 08 — Azure Deployment

Source: `azure/` (README, `azure-deployment-boundary.md`, pipeline + endpoint YAML, scoring scripts).

## What ships
| Concern | File |
|---|---|
| Training pipeline | `azure/ml-pipeline.yml` |
| Online endpoint | `azure/online-endpoint.yml` + `azure/online-deployment.yml` |
| Online scoring | `azure/score_online.py` |
| Batch endpoint | `azure/batch-endpoint.yml` + `azure/batch-deployment.yml` |
| Environments | `azure/environments/{training,serving,batch}.yml` |
| Deploy scripts | `azure/deploy-azureml.sh`, `azure/deploy-endpoints.sh` |
| Local validation | `azure/local-validation.sh` |
| Samples | `azure/samples/online-request.json`, `batch-input.csv` |

## Deployment shapes
- **Online managed endpoint** — real-time scoring of a single `CaseRequest`, mirrors the local `/predict`.
- **Batch endpoint** — scores a CSV of cases, mirrors `ml/batch_score.py`; preview surfaces in the [[04 - Dashboard|Batch panel]].

## Azure web hosting path
- Use `azure/web-app-deployment.md` to host the browser API on Azure Functions and the dashboard on Azure Storage static website hosting while the Static Web App resource is investigated.
- `function_app.py` exposes the FastAPI app as an ASGI Function App. `frontend/staticwebapp.config.json` preserves React routes for the Static Web Apps path; the currently verified public dashboard is the storage static website URL.

## Current demo status
- As of 2026-06-14, Azure ML deployment is working in resource group `rg-service-priority-ai-demo`, workspace `mlw-service-priority-ai-v2`, UK South.
- Model `service-priority-ai:1` is registered from local `ml/artifacts`, with `service-priority-serving:2` and `service-priority-batch:2` pinned to the local training dependency versions.
- Online endpoint `ep-service-priority-ai` routes 100% traffic to deployment `blue`; direct HTTP scoring returns the same high-priority sample response as local `azure/score_online.py`.
- Batch endpoint `be-service-priority-ai` uses deployment `default` on `cpu-cluster`; sample CSV invocation completed and produced `predictions.csv`.
- Browser API wrapper `func-service-priority-ai-api` exposes the FastAPI routes through Azure Functions at `https://func-service-priority-ai-api.azurewebsites.net`.
- The Function App uses Azure Table Storage for durable audit records when `AzureWebJobsStorage` is available, default table `ServicePriorityAudit`; `/audit/summary` reports the active mode.
- Verified public dashboard: `https://stspaisite154550.z33.web.core.windows.net/#/dashboard`, built with `VITE_API_BASE=https://func-service-priority-ai-api.azurewebsites.net`.

## Boundary: real vs requires-Azure
Per `azure/azure-deployment-boundary.md`:
- ✅ **Real now (local):** data, training, evaluation, gating, FastAPI `/predict` + `/chat`, monitoring metrics, frontend, batch scoring script.
- ✅ **Real now (Azure):** Azure ML workspace, model registry, online endpoint, batch endpoint, Azure Functions browser API, Azure-hosted dashboard, durable audit pattern through Function storage.
- ☁️ **Requires production hardening:** Azure Responsible AI scorecard, Power BI publish, APIM/Entra access controls, Key Vault secret management, retention policy, and service-owner monitoring thresholds.

This boundary is deliberately explicit so reviewers know what runs offline vs. what needs a subscription. See [[09 - Decisions]] and [[07 - Responsible-AI]].

## Related notes

- [[02 - Architecture]] - local-to-cloud system map
- [[06 - Model]] - registered model and scoring contract
- [[07 - Responsible-AI]] - production hardening and governance
- [[09 - Decisions]] - deployment claims and boundaries
- [[11 - Interview Prep]] - cloud evidence checklist
- [[13 - Project Operating Memory]] - verification prompts

#servicePriorityAI #azure
