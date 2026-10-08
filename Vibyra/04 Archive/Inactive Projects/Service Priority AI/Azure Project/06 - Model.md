---
title: Model
aliases:
  - ML Model
  - service-priority-ai-baseline
tags:
  - model
  - ml
  - metrics
  - service-priority-ai
project: Service Priority AI
status: active
note_type: model-card
created: 2026-06-04
updated: 2026-06-29
---

# 06 — Model

`service-priority-ai-baseline` **v0.1.0** — source: `ml/train_model.py`, artifacts in `ml/artifacts/`.

## Pipeline
A scikit-learn `Pipeline` (`preprocess` → `classifier`):
- **Logistic Regression** classifier, `class_weight="balanced"` (handles the priority imbalance).
- **ColumnTransformer** preprocessing:
  - `OneHotEncoder` on categoricals (service_type, service_subtype, district, source_system, flags, deprivation_band, channel)
  - `StandardScaler` on numerics (month, sla_hours, days_open, previous_contacts)
  - `TfidfVectorizer` (ngram 1–2, `min_df=2`) on the `urgency_text` notes
- Output classes: `low`, `medium`, `high`.

## Features (`ml/feature_contract.md`)
| Feature | Type | Meaning |
|---|---|---|
| service_type | categorical | which service area |
| service_subtype | categorical | service pathway or issue category |
| district | categorical | aggregate Essex district context |
| month | numeric | seasonal context |
| source_system | categorical | intake system/channel source |
| sla_hours | numeric | operational response window |
| out_of_hours | bool | contact outside normal operating hours |
| accessibility_need | bool | reasonable-adjustment context |
| duplicate_signal | bool | linked/repeated case signal |
| days_open | numeric | case age in days |
| previous_contacts | numeric | prior touches on the case |
| vulnerability_flag | bool | extra-care indicator |
| deprivation_band | categorical | area-risk **context** signal (not eligibility) |
| channel | categorical | web / phone / email / in_person |
| urgency_text | text | free-text case notes |

## Metrics (`evaluation.json`, 5,000 validation rows)
| Metric | Value |
|---|---|
| Accuracy | **0.9020** |
| Macro F1 | **0.9035** |
| High-priority recall | **0.9408** |
| Gate (recall floor 0.75) | **pass** |
| Fairness status | `review_required` → [[07 - Responsible-AI]] |

Trained on **20,000** rows / validated on **5,000**.

## Global explainability (`shap_summary.json`, high class — mean |SHAP|)
1. vulnerability flag true — **1.478**
2. previous contacts — **1.459**
3. vulnerability flag false — **1.297**
4. sla hours — **1.216**
5. days open — **1.120**

Per-prediction attributions are computed live in `model_service.py` from the logistic coefficients × transformed feature values. A rules-based fallback exists if the joblib is missing.

See [[04 - Dashboard]] (SHAP panel) and [[05 - Chatbot]] (features intent).

## Related notes

- [[02 - Architecture]] - where the model is loaded and served
- [[04 - Dashboard]] - model evidence in the UI
- [[05 - Chatbot]] - artifact-grounded model explanations
- [[07 - Responsible-AI]] - fairness interpretation
- [[08 - Azure-Deployment]] - model registry and endpoints
- [[10 - Glossary]] - model terms

#servicePriorityAI #model
