---
title: RelayClarity Memory Lives In The Global Vault, Scoped
type: decision
project: RelayClarity
date: 2026-06-23
status: accepted
tags:
  - ai/decisions
  - project/relayclarity
links:
  - "[[RelayClarity Memory]]"
  - "[[01 Projects/RelayClarity/Decisions]]"
---

# 2026-06-23: RelayClarity Memory Lives In The Global Vault, Scoped

> [!info] AI quick context
> RelayClarity memory belongs in `01 Projects/RelayClarity/`, not in the RelayClarity repo or the Vibyra core notes. Commit and edit this project memory path-scoped.

**Decision**: RelayClarity's durable memory lives in the global Obsidian vault
(`/home/ellis/Desktop/SaaS/Vibyra/`) under a dedicated `01 Projects/RelayClarity/` folder,
not in the RelayClarity code repo.

**Why**: The user wants one global vault, git-synced (pull/push), but with each project
clearly scoped. RelayClarity is a separate codebase from Vibyra; mixing its notes into the
flat Vibyra `_ai/` notes would be confusing. A namespaced subfolder keeps it discoverable
and isolated.

**How to apply**:
- Write RelayClarity context under `01 Projects/RelayClarity/` only; never into Vibyra core notes.
- Entry point is [[RelayClarity Memory]]; registered in the vault `Home.md` and `Context Map.md`.
- The RelayClarity repo carries a small `AGENTS.md` pointing sessions here.
- An earlier in-repo `_ai/` vault inside the Zoom project was removed in favor of this.

**Sync caveat (2026-06-23)**: `git fetch`/push to `ellisthreader/Vibyra` failed with an
access-rights error in the working environment â€” automated pull/push may need SSH auth set up.
Commits should be path-scoped to `01 Projects/RelayClarity/` (+ index files); the vault repo carries
unrelated Vibyra WIP that must not be swept into RelayClarity commits.
