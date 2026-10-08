---
title: Operational Dashboard Requires Launch
type: decision
project: RelayClarity
date: 2026-06-25
status: accepted
tags:
  - ai/decisions
  - project/relayclarity
links:
  - "[[01 Projects/RelayClarity/Decisions]]"
  - "[[01 Projects/RelayClarity/Runs]]"
---

# 2026-06-25: Operational Dashboard Requires Launch

> [!info] AI quick context
> Keep operational dashboard surfaces gated until Launch Gate is passed. This affects metrics, risk queue, calls, chats, Live Queue, sidebar routing, and assistant responses.

Decision: Metrics, calls, chats, and Live Queue are production operational surfaces and stay inaccessible until the Launch Gate has passed and the agent is explicitly launched.

Implementation note: `src/main.tsx` treats `isLaunchDeployed` as the unlock state. Before launch, `metrics` and `risk` routes are disabled in the sidebar, direct route attempts render/redirect to Launch Gate, assistant prompts are answered locally without operational charts, and risk queue polling is skipped. Settings/help rows that would navigate to operational surfaces also route to Launch Gate until live.
