---
title: Interview Cue Card (Simple)
aliases:
  - ECC Cue Card
  - Simple Interview Script
tags:
  - interview
  - essex
  - mlops
  - service-priority-ai
project: Service Priority AI
status: active
note_type: interview-prep
created: 2026-06-29
updated: 2026-06-29
---

# 14 — Interview Cue Card (Simple)

Plain-English script for the ECC AI / ML Engineer presentation. See also [[11 - Interview Prep]] and [[06 - Model]].

## One line to memorise
> "Service Priority AI is an Azure ML system that relays a clearer priority signal — low / medium / high — to a human officer, so urgent cases aren't missed. It's advisory and uses synthetic data. I built it all."

## Two safety lines (repeat when stuck)
- "It's **advisory** — a human always decides."
- "It uses **synthetic data** — proves the delivery pattern, not live performance."

## Numbers to quote
- **90.2% accuracy** · **0.90 macro F1** · **94% high-priority recall**
- **25,000 synthetic cases** (20,000 train / 5,000 validation)
- scikit-learn **LogisticRegression** + structured fields + TF-IDF text

## Slide-by-slide (say it this simply)
1. **Ellis Threader** — "I'm Ellis, an AI/ML Engineer. I build ML models and run them safely in the cloud. Here's an example."
2. **Service Priority AI** — "Azure-hosted demo. ML makes case priority clearer for officers. Not autonomous. Synthetic data only."
3. **Context & My Role** — "Problem: urgent cases hidden in busy queues. Users: officers, managers, governance. I built all of it — data, model, API, React workflow, Azure, audit, monitoring, governance docs."
4. **Data & Limitations** — "25k synthetic cases. Honest limits: synthetic labels, sensitive text, incomplete vulnerability data, deprivation is a proxy. My answer is governance + human review, not pretending it's perfect."
5. **Model & Evaluation** — "Deliberately simple, transparent model. 90% accuracy and **94% recall on high-priority** — missing an urgent case is worse than over-escalating a routine one."
6. **Cloud Architecture** — "Azure ML = train, evaluate, registry, endpoints. Azure Functions = safe API with audit. Batch scoring for queues. No AKS — too much overhead for this scale."
7. **Deployment Evidence** — "Not just a notebook: workspace, registered model, online + batch endpoints, Functions API, static site, durable audit table, budget alert. No resident data, no secrets."
8. **Production Safety Controls** — "Typed API contracts, tests, pinned environments, model card, DPIA-lite, Responsible AI assessment, endpoint auth, server-side audit, rollback, cost controls."
9. **Monitoring** — "Two layers: operational (health, latency, errors) and model (confidence, class mix, drift, fairness, explanation coverage, overrides). Exports Power BI tables."
10. **Incident & Learning** — "Azure quota blocked a UK South app. Root cause was quota, not my model. Switched to Azure Functions Flex Consumption, kept Azure ML behind the governed layer. No residents affected — synthetic data."
11. **What I'd Bring to ECC** — "Azure MLOps, online + batch endpoints, monitoring, Responsible AI, UK GDPR governance, Power BI, auditability, coaching colleagues."

## Closing line
> "For public-sector AI, deployment isn't just getting a model behind an endpoint — it's making it reproducible, explainable, monitored, governed, and safe for people to challenge."

## Likely questions (simple answers)
- **Why Azure ML, not just FastAPI?** "Reproducibility and governance — versioned models, registry, managed endpoints I can roll back."
- **Why not a bigger / AutoML model?** "Public-sector accountability. A model I can explain and audit beats a black box."
- **Before real data?** "IG sign-off, full DPIA, Entra ID auth, Key Vault, APIM."
- **Detect drift?** "Compare live inputs and confidence against the training baseline; watch fairness slices."
- **If high-priority recall dropped?** "Alert, investigate drift, lower the threshold to stay safe, retrain through the governed pipeline."
- **Stop over-reliance?** "Advisory only, shows confidence + reasons, flags low-confidence cases, logs every override."

## LLM disclosure (they ask for this)
> "I used an LLM to structure and polish the deck and check it against the brief. I verified every fact against my repository, Azure config and generated artifacts. I did not use it to invent experience, metrics, incidents or cloud resources."

## RelayClarity — how to use it honestly
- RelayClarity (the "test zoom project") is a **voice-agent deployment platform** (OpenAI realtime + ElevenLabs + Twilio).
- Its priority scorer is **keyword rules + an LLM** — **NOT a trained ML model**. Dashboard scores are hardcoded demo numbers.
- **Do not call it machine learning.** Use it only as a *second* proof point that you've shipped production AI before:
> "I've also built RelayClarity — taking AI voice agents from pilot to production with evaluation and latency tuning. That's LLM and voice-agent orchestration, not a trained model. My trained ML model is Service Priority AI."

## Best real examples of ML (for context / comparison)
ML is the right tool when there's **lots of past data with known outcomes** and the patterns are **too messy for if/then rules**.
- Recommendation (Netflix, Spotify, Amazon)
- Fraud / anomaly detection (banks)
- Spam filtering (Gmail)
- Forecasting (demand, pricing, stock)
- Medical imaging (tumour detection)
- Predictive maintenance ("this machine will fail soon")
- Churn prediction ("this customer will leave")
- **Triage / prioritisation** ← this is what Service Priority AI does (learns from 25k cases to rank new ones)
