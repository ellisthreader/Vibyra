---
title: Overview
aliases:
  - Project Overview
  - Service Priority AI Overview
tags:
  - overview
  - product
  - service-priority-ai
project: Service Priority AI
status: active
note_type: overview
created: 2026-06-04
updated: 2026-06-29
---

# 01 — Overview

## What it is
**Service Priority AI** is a responsible-AI demonstration that triages incoming public-service requests (housing repairs, adult social care, children & families, highways, waste, benefits, council tax) and predicts a **priority band** — `low`, `medium`, or `high` — so urgent cases reach a caseworker first.

It is a full ML lifecycle in miniature: synthetic data → trained model → API → UI → Azure deployment artifacts → monitoring. See [[02 - Architecture]].

## Goals
- Show an **end-to-end, production-shaped** ML system, not just a notebook.
- Keep every prediction **explainable** (reason codes + per-case feature attributions).
- Make **fairness and governance** first-class, not an afterthought — see [[07 - Responsible-AI]].
- Provide a polished **public portal** + an **OpenAI-style operator dashboard** + a grounded **chatbot** — see [[03 - Frontend]].

## Who it's for
- **Caseworkers / duty teams** — the people who act on the priority.
- **Governance / information-governance** — who need fairness and DPIA evidence.
- **Portfolio reviewers** — demonstrating Azure MLOps + responsible-AI competence.

## Non-goals
- Not a real benefits/eligibility decision system.
- Not autonomous — it never actions a case on its own.

> [!warning] Synthetic + advisory
> All cases are **synthetic**. Output is **advisory only**. The area-risk / deprivation signal is a service-risk context feature, **not** an eligibility decision. See [[09 - Decisions]].

## Related notes

- [[12 - AI Quick Context]] - one-screen AI handoff
- [[02 - Architecture]] - system flow
- [[07 - Responsible-AI]] - safe-use posture
- [[11 - Interview Prep]] - presentation framing

#servicePriorityAI
