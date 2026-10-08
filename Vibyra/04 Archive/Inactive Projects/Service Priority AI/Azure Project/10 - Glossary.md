---
title: Glossary
aliases:
  - Terms
  - Project Glossary
tags:
  - glossary
  - reference
  - service-priority-ai
project: Service Priority AI
status: active
note_type: glossary
created: 2026-06-04
updated: 2026-06-29
---

# 10 — Glossary

- **Triage** — scoring an incoming request to decide how urgently it needs attention. The core job of this system → [[01 - Overview]].
- **Priority band** — the model's output class: `low`, `medium`, or `high` → [[06 - Model]].
- **CaseRequest** — the input record: service_type, days_open, previous_contacts, vulnerability_flag, deprivation_band, channel, urgency_text.
- **Deprivation band** — an area-risk **context** signal (low/medium/high). Used as context, **not** an eligibility decision → [[07 - Responsible-AI]].
- **Vulnerability flag** — indicator that a resident needs extra care; a deliberate priority signal and a monitored fairness cohort.
- **SHAP** — SHapley Additive exPlanations; here, mean absolute SHAP gives global feature importance per class → [[06 - Model]].
- **Feature attribution** — the per-prediction version: which features pushed *this* score up or down (logistic coef × value).
- **Reason codes** — plain-English explanations attached to each prediction (`model_service.explain`).
- **Drift** — change in input/output distribution over time; watched via `low_confidence_rate` and monitoring metrics → [[07 - Responsible-AI]].
- **Gate** — a quality threshold a model must pass to be promotable (high-priority recall floor 0.75 → currently **pass**) → [[06 - Model]].
- **Human-in-the-loop** — a person reviews/decides; the model is advisory → [[09 - Decisions]].
- **DPIA** — Data Protection Impact Assessment; a DPIA-lite is included → [[07 - Responsible-AI]].
- **Managed endpoint** — an Azure ML hosted scoring service (online or batch) → [[08 - Azure-Deployment]].

## Related notes

- [[12 - AI Quick Context]] - concise project vocabulary
- [[02 - Architecture]] - technical terms in context
- [[06 - Model]] - model and metric terms
- [[07 - Responsible-AI]] - governance terms
- [[08 - Azure-Deployment]] - Azure terms
- [[11 - Interview Prep]] - panel-facing wording

#servicePriorityAI #glossary
