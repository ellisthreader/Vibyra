---
title: Desktop Index
tags:
  - ai/desktop
  - index
status: active
scope: Desktop
---

# Desktop

## AI quick context

Desktop notes describe the local Vibyra shell and bridge: terminal tabs, provider runtimes, project discovery, preview servers, account/auth UI, voice, editable project memory, Team planning, role prompts, and native provider rollout. Start here to route work to the right desktop subsystem before touching implementation files.

## Primary notes

- [[AI Terminals]] - PTY tabs, provider runtime selection, terminal commands, Vibyra Agent, managed-credit gateways, Teams, and companion panels.
- [[Desktop Shell]] - `/desktop`, auth gate, profile/settings, billing surfaces, launcher behavior, Electron external links, and shell UI contracts.
- [[Projects And Preview]] - project discovery/search/context, preview resolver/dev servers, right-click element editing, and preview security.
- [[Voice And Project Memory]] - AI Talk, terminal dictation, prompt transcripts, editable project memory, and memory sync surfaces.
- [[AI Team Dynamic Planner Implementation Plan]] - bridge-owned Team planner contracts, validation, rollout, and work packages.
- [[AI Team Orchestration Plan]] - execution model, prompt compiler, runtime enforcement, state, handoffs, and rollout.
- [[AI Team Role Prompt Specification]] - coordinator/builder/verifier/reviewer role contracts and provider adapters.
- [[AI Team Prompting Research]] - cross-provider prompting findings for Team orchestration.
- [[Native Provider Terminal Plan]] - gated rollout plan for Qwen, Kimi, Mistral, and Grok native CLIs.
- [[Agent Runs And Commands]] - agent implementation registry, permission gate, multi-agent state, vault lookup, safe commands, and PTY routes.
- [[Screenshot Capture]] - screenshot capture contract and ownership.
- [[Pairing And Phone Session]] - phone pairing, LAN URLs, and session security.
- [[Local Vibyra AI]] - product decision and runtime for local Vibyra AI.

## Decisions surfaced

- [[AI Terminals]] is the authority for terminal UI, native CLI runtime selection, provider identity, and managed-credit terminal gateways.
- [[Desktop Shell]] keeps Terminals as the default authenticated surface and avoids restoring a Home landing page.
- [[Projects And Preview]] requires explicit user approval before running project preview commands and keeps project-scoped preview capabilities separate from global desktop tokens.
- [[AI Team Dynamic Planner Implementation Plan]] keeps Team planning policy deterministic; AI output cannot add roles, permissions, dependencies, tools, commands, or trusted instructions.
- [[Native Provider Terminal Plan]] keeps new native provider support disabled until capture, sandbox, credential, billing, and PTY evidence are complete.

## Open todos and watchpoints

- [[AI Team Dynamic Planner Implementation Plan#Implementation Work Packages]] - remaining planner implementation packages.
- [[AI Team Dynamic Planner Implementation Plan#Definition Of Done]] - release criteria for Team planner work.
- [[Native Provider Terminal Plan#Provider Go/No-Go Matrix]] - provider-specific release gates.
- [[Native Provider Terminal Plan#Final Validation]] - final validation bundle before enabling native providers.
- [[Screenshot Capture#Validation]] - capture validation expectations.

## Related Backend notes

- [[Chat And Cost Controls]] - metered chat, terminal, research, and Responses API reservation/settlement.
- [[Auth And Cloud Sync]] - bearer sessions and desktop auth flows.
- [[Hosted Demos]] - public hosted demo state consumed by preview/community surfaces.
- [[Billing Credits And Levels]] - plan caps, terminal limits, and billing payloads used by desktop.
