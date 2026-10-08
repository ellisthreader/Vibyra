---
title: Decisions
aliases:
  - Decision Log
  - ADR Log
tags:
  - decisions
  - adr
  - service-priority-ai
project: Service Priority AI
status: active
note_type: decision-log
created: 2026-06-04
updated: 2026-06-29
---

# 09 — Decisions

Lightweight ADR-style log. Newest first.

## 2026-06-04 — In-repo Obsidian vault
**Decision:** keep project knowledge in `vault/` inside the repo.
**Why:** docs travel with the code and version together; future sessions read the vault instead of re-deriving context from source. Links: this whole vault.

## 2026-06-04 — Deterministic grounded chatbot (no external LLM)
**Decision:** `backend/app/chat.py` routes intents by keyword over the model artifacts; no API key, no LLM call.
**Why:** runs fully offline, is reproducible, cannot hallucinate metrics, and can never contradict what the model reports. Cost-free and demo-safe. Trade-off: less conversational flexibility — acceptable for a grounded operator assistant. See [[05 - Chatbot]].

## 2026-06-04 — OpenAI-platform-style dashboard
**Decision:** restyle the operator console to a neutral, OpenAI-platform-inspired layout (section sidebar, light canvas, near-black primary, green accent).
**Why:** instantly legible "developer console" aesthetic; separates the operator surface from the civic public portal. See [[04 - Dashboard]].

## 2026-06-04 — Public portal is original, not a clone
**Decision:** the public home page is **inspired by** the information architecture of a public-sector recruitment/service site, but uses entirely **original copy and original SVG/CSS-gradient media**. No third-party images, video, logos, or branding were copied.
**Why:** legal cleanliness (no copyrighted/trademarked assets) and a stronger portfolio piece than a literal clone. Content lives in `frontend/src/home/content.ts`. See [[03 - Frontend]].

## (Baseline) — Advisory only + human-in-the-loop
**Decision:** the model never actions a case; `high` or low-confidence predictions auto-flag for human review.
**Why:** public-service risk posture; fairness and accountability. See [[07 - Responsible-AI]].

## (Baseline) — Synthetic data only
**Decision:** all cases are generated (`ml/generate_data.py`).
**Why:** no real personal data; safe to share and reproduce. See [[01 - Overview]].

## Related notes

- [[12 - AI Quick Context]] - claims to preserve
- [[13 - Project Operating Memory]] - active invariants
- [[07 - Responsible-AI]] - governance consequences
- [[08 - Azure-Deployment]] - cloud boundary implications
- [[11 - Interview Prep]] - presentation guardrails

#servicePriorityAI #decisions
