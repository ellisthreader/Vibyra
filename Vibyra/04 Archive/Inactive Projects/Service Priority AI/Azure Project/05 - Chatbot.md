---
title: Chatbot
aliases:
  - Grounded Assistant
  - Chat Assistant
tags:
  - chatbot
  - backend
  - assistant
  - service-priority-ai
project: Service Priority AI
status: active
note_type: implementation
created: 2026-06-04
updated: 2026-06-29
---

# 05 — Chatbot

A floating home-route assistant (`frontend/src/chat/ChatWidget.tsx`) backed by `POST /chat` (`backend/app/chat.py`). It is a **deterministic, offline, grounded** assistant — **no external LLM** is called (see [[09 - Decisions]]). Replies are produced by keyword intent-routing over the model artifacts, so the assistant can never contradict what the model actually reports.

## Contract
`POST /chat`
```json
// request
{ "message": "string",
  "history": [{ "role": "user|assistant", "content": "string" }],
  "case_context": CaseRequest | null }

// response
{ "reply": "string",
  "suggestions": ["string"],
  "prediction": PredictionResponse | null,
  "citations": [{ "label": "string", "source": "artifact-filename" }] }
```

## Intents (keyword-routed in `ChatAssistant.respond`)
| Intent | Triggers | Behaviour |
|---|---|---|
| Greeting / help | hi, hello, help, what can you | Capabilities + starter suggestions |
| Explain model | how does, what is, explain, accuracy | Pulls type + metrics from `model_metadata.json` + `evaluation.json` (cited) → [[06 - Model]] |
| Fairness | fair, bias, cohort, equity | Summarises `fairness_slices`, esp. vulnerability cohort (cites `evaluation.json`) → [[07 - Responsible-AI]] |
| Features | feature, shap, important, drives | Top global SHAP features (cites `shap_summary.json`) |
| Governance | govern, human review, dpia, responsible | Advisory + human-in-the-loop + artifacts |
| **Triage** | triage, score, predict, urgent, priority | If `case_context` present → runs `model_service.predict` and returns a populated `prediction`; else asks for the case fields |
| Fallback | anything else | Points to the three things it can do |

## Frontend behaviour
- Greets on load, shows suggestion chips, supports Enter-to-send (Shift+Enter = newline).
- Renders an inline mini priority card when `prediction` is returned, and citation chips.
- Shows online/offline state from the shared API ping in [[03 - Frontend]].
- `case_context` is the **same** `caseInput` the dashboard form edits → [[04 - Dashboard]].

## Related notes

- [[03 - Frontend]] - widget placement and shared state
- [[04 - Dashboard]] - current case context
- [[06 - Model]] - prediction/explanation source
- [[07 - Responsible-AI]] - governance and human review responses
- [[09 - Decisions]] - no external LLM decision
- [[13 - Project Operating Memory]] - assistant placement constraints

#servicePriorityAI #chatbot
