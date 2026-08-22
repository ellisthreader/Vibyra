---
title: Azure Project Home
aliases:
  - Service Priority AI Home
  - Azure Project Home
tags:
  - moc
  - home
  - service-priority-ai
project: Service Priority AI
status: active
note_type: index
created: 2026-06-04
updated: 2026-06-29
---

# Azure Project Home - Map of Content

The single entry point for the **Service Priority AI** project vault. Start here before reading source code.

> [!tip] AI quick start
> Read [[12 - AI Quick Context]] first, then [[13 - Project Operating Memory]], then follow the links below for the area being changed.

## Start here

- [[12 - AI Quick Context]] - one-screen project brief for AI sessions
- [[13 - Project Operating Memory]] - durable constraints, current state, and next checks
- [[01 - Overview]] - the one-paragraph version, goals, audience
- [[02 - Architecture]] - how data flows from synthetic generation to dashboard

## Build it

- [[03 - Frontend]] - React app: public portal + console + chatbot rail
- [[04 - Dashboard]] - employee casework dashboard and manager MLOps assurance
- [[05 - Chatbot]] - grounded `/chat` assistant
- [[06 - Model]] - the scikit-learn pipeline, features, and metrics

## Ship it responsibly

- [[07 - Responsible-AI]] - advisory stance, fairness, human review
- [[08 - Azure-Deployment]] - online + batch managed endpoints

## Reference

- [[09 - Decisions]] - why things are the way they are
- [[10 - Glossary]] - terminology
- [[11 - Interview Prep]] - Essex AI / ML Engineer presentation plan
- [[14 - Interview Cue Card (Simple)]] - plain-English slide-by-slide script, Q&A, RelayClarity + ML examples

## Project graph

```mermaid
graph TD
  Home --> Quick["12 - AI Quick Context"]
  Home --> Memory["13 - Project Operating Memory"]
  Quick --> Overview["01 - Overview"]
  Overview --> Architecture["02 - Architecture"]
  Architecture --> Frontend["03 - Frontend"]
  Frontend --> Dashboard["04 - Dashboard"]
  Frontend --> Chatbot["05 - Chatbot"]
  Architecture --> Model["06 - Model"]
  Model --> Responsible["07 - Responsible-AI"]
  Responsible --> Deployment["08 - Azure-Deployment"]
  Memory --> Decisions["09 - Decisions"]
  Memory --> Glossary["10 - Glossary"]
  Memory --> Interview["11 - Interview Prep"]
```

## Quick facts

- Model: `service-priority-ai-baseline` **v0.1.0** - see [[06 - Model]]
- Validation accuracy approximately **90%**, high-priority recall approximately **94%**
- Decision mode: **advisory** + human-in-the-loop - see [[07 - Responsible-AI]]
- Backend routes: `/predict`, `/chat`, `/metrics/summary`, `/dashboard/summary`
- Verified Azure demo details live in [[08 - Azure-Deployment]] and [[11 - Interview Prep]]

#servicePriorityAI #moc
