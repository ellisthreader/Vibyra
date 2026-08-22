---
title: Interview Prep
aliases:
  - Essex Interview Prep
  - AI ML Engineer Interview
tags:
  - interview
  - essex
  - mlops
  - service-priority-ai
project: Service Priority AI
status: active
note_type: interview-prep
created: 2026-06-14
updated: 2026-06-29
---

# 11 — Interview Prep

> [!tip] Day-of cue card
> For the short, say-it-out-loud version (slide-by-slide script, simple Q&A, LLM disclosure, RelayClarity honesty, ML examples) use [[14 - Interview Cue Card (Simple)]].

ECC interview context: AI / ML Engineer, fixed-term 12 months, Chelmsford / Anywhere worker. Interviews are scheduled across **Monday 29 June 2026**, **Tuesday 30 June 2026**, and **Friday 3 July 2026** by MS Teams.

The required task is a **10-minute presentation** about a **real AI/ML model deployed to cloud**. The panel wants evidence of safe, reliable production ML delivery.

Detailed working plan: [docs/essex-interview-prep.md](../docs/essex-interview-prep.md)

## Presentation Spine

1. Context and role: Service Priority AI as a public-sector triage MLOps case study.
2. Data limitations: synthetic data, free-text risk, vulnerability/deprivation proxies, no real resident claims.
3. Model and evaluation: transparent scikit-learn baseline, high-priority recall, macro F1, fairness slices, explainability.
4. Azure architecture: Azure ML pipeline, registry, environments, online endpoint, batch endpoint, Azure Functions wrapper, monitoring exports.
5. Production safety: tests, typed API, model card, DPIA-lite, Responsible AI, validation gates, cost controls.
6. Monitoring and incident: endpoint health, latency/errors, drift, fairness, explanation coverage; App Service quota issue mitigated with Azure Functions if verified.
7. Learning and next steps: durable telemetry, Power BI monitoring, service-owner thresholds, override workflow, governance sign-off.

## Non-Negotiables

- Do not claim live resident use.
- Do not claim real-world fairness/performance from synthetic data.
- Do not invent a production incident.
- Use only cloud claims that are backed by screenshots, CLI output, or repo artifacts.
- Disclose LLM use if the final deck is LLM-assisted.

## Related notes

- [[12 - AI Quick Context]] - fast project refresher
- [[13 - Project Operating Memory]] - verification prompts and invariants
- [[02 - Architecture]] - diagram and system narrative
- [[06 - Model]] - metrics to present carefully
- [[07 - Responsible-AI]] - safe-use and governance story
- [[08 - Azure-Deployment]] - cloud resource claims
- [[09 - Decisions]] - guardrails for panel answers

#servicePriorityAI #interview #essex
