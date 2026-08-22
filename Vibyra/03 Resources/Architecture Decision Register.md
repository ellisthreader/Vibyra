---
title: Architecture Decision Register
type: decision-register
status: active
updated: 2026-07-10
source: project decision notes and Codex chats
confidence: high
tags:
  - resource/architecture
  - decisions
---

# Architecture Decision Register

Cross-project decisions only. Project-specific detail remains in each project's decision or memory note.

## AI decisions remain human-accountable

### Decision

High-impact AI outputs are recommendations; a human owns the final decision and can override or escalate.

### Context

Service Priority AI prioritises council cases, and ClearDBS provides guidance in a regulated process.

### Options considered

- Automated action from model/assistant output.
- Advisory output with evidence, confidence, and human review.

### Chosen approach

Advisory output, human review, explicit escalation, and synthetic/demo data where applicable.

### Reason

Accountability, uncertainty, fairness, and the risk of implying official authority.

### Consequences

The UI must expose evidence/uncertainty and preserve staff decision steps; copy must not promise automated official decisions.

### Current validity

Active. See [[01 Projects/Service Priority AI/Azure Project/09 - Decisions|Service Priority AI Decisions]] and [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]].

## Separate extraction from prediction

### Decision

Operational text extraction and ML prediction should be separate API steps.

### Context

Service Priority AI needs pasted/uploaded information mapped into a validated case schema before scoring.

### Options considered

- One opaque endpoint that extracts and predicts.
- A deterministic extraction endpoint followed by staff review and a separate prediction call.

### Chosen approach

Text in -> validated `CaseRequest` fields -> staff review/edit -> prediction -> staff final decision.

### Reason

Improves auditability, correction, testing, and human control.

### Consequences

The UI needs a step-by-step flow and plain clarification for unknown fields; backend/model logic remains outside the frontend.

### Current validity

Active design principle. See [[01 Projects/Service Priority AI/Azure Project/13 - Project Operating Memory|Project Operating Memory]].

## ClearDBS website and RelayClarity voice backend stay separate

### Decision

ClearDBS remains the Laravel/Inertia website; the voice/AI demo backend is supplied by the RelayClarity codebase.

### Context

Lookalike Desktop folders caused the wrong project to be edited or served.

### Options considered

- Treat the Desktop `clear dbs` copy as the website.
- Keep canonical ClearDBS and RelayClarity repositories distinct with an explicit integration boundary.

### Chosen approach

Use `C:\Users\Ellis\ClearDBS` for the website and `/home/ellis/Desktop/RelayClarity` for active RelayClarity backend work; verify active ports before demos.

### Reason

Repository integrity and clear ownership.

### Consequences

Two services may need to run; memory and incidents must link across projects without merging their source identities.

### Current validity

Active. See [[01 Projects/ClearDBS/Incidents/Clear DBS Workspace Misrouting Incident Report|misrouting incident]].

## Vibyra desktop is a local HTTP bridge with versioned launch behavior

### Decision

Vibyra's desktop app owns a local bridge for pairing, projects, previews, terminals, and commands; launchers must verify the expected bridge contract before reuse.

### Context

The product spans mobile, Electron, provider CLIs, PTYs, and local projects. Healthy-but-stale bridges caused terminal incompatibility.

### Options considered

- Direct feature-specific processes with no common contract.
- A local authenticated HTTP bridge with route groups and version-aware startup.

### Chosen approach

Authenticated local bridge, explicit route ownership, bearer-token protection, and launch-contract checks.

### Reason

Centralises local-machine authority and gives mobile/desktop surfaces a stable boundary.

### Consequences

Startup, bridge reuse, process cleanup, token handling, and route compatibility require regression tests.

### Current validity

Active. See [[01 Projects/Vibyra/Memory/Vibyra Desktop Memory|Vibyra Desktop Memory]].

## HKE runtime catalog prefers DB data with a deliberate empty-DB fallback

### Decision

The live HKE database remains the runtime source of truth; seed JSON is a controlled fallback when the catalog DB is empty.

### Context

The menu could be correctly organised in seed data while the page rendered no dishes or old image paths.

### Options considered

- Read seed JSON directly for every request.
- Require populated DB only.
- Use DB normally and fall back to seed data only when empty.

### Chosen approach

DB-first with tested empty-DB fallback; keep image URLs/media rows synchronised.

### Reason

Preserves editable runtime data while preventing a blank local/demo menu.

### Consequences

Tests must cover both populated and empty DB states; image generation is incomplete until DB references are updated.

### Current validity

Active. See [[01 Projects/Hong Kong Express/Lessons/Menu catalog must fall back to seed JSON when DB is empty|menu fallback lesson]].

## Obsidian is the compact memory layer, not a transcript archive

### Decision

Store concise project facts, decisions, incidents, runbooks, and source links in Obsidian; keep raw chats/logs outside the durable memory layer.

### Context

The local session corpus is large, repetitive, may contain credentials, and is expensive for future agents to reread.

### Options considered

- Copy full transcripts into notes.
- Rely only on raw logs.
- Maintain concise linked memory with explicit provenance and confidence.

### Chosen approach

PARA-style Global vault, project-scoped memory, central coding context, and redacted audit provenance.

### Reason

Faster future sessions, less drift, clearer source boundaries, and lower secret exposure.

### Consequences

Notes require periodic review against repositories and chats; uncertain claims must stay labelled.

### Current validity

Active. See [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]] and [[01 Projects/Vibyra/Operating Memory/Memory Protocol|Memory Protocol]].

