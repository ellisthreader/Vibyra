# 2026-06-23: RelayClarity Memory Lives In The Global Vault, Scoped

**Decision**: RelayClarity's durable memory lives in the global Obsidian vault
(`/home/ellis/Desktop/SaaS/Vibyra/`) under a dedicated `_ai/RelayClarity/` folder,
not in the RelayClarity code repo.

**Why**: The user wants one global vault, git-synced (pull/push), but with each project
clearly scoped. RelayClarity is a separate codebase from Vibyra; mixing its notes into the
flat Vibyra `_ai/` notes would be confusing. A namespaced subfolder keeps it discoverable
and isolated.

**How to apply**:
- Write RelayClarity context under `_ai/RelayClarity/` only; never into Vibyra core notes.
- Entry point is [[RelayClarity Memory]]; registered in the vault `Home.md` and `Context Map.md`.
- The RelayClarity repo carries a small `AGENTS.md` pointing sessions here.
- An earlier in-repo `_ai/` vault inside the Zoom project was removed in favor of this.

**Sync caveat (2026-06-23)**: `git fetch`/push to `ellisthreader/Vibyra` failed with an
access-rights error in the working environment — automated pull/push may need SSH auth set up.
Commits should be path-scoped to `_ai/RelayClarity/` (+ index files); the vault repo carries
unrelated Vibyra WIP that must not be swept into RelayClarity commits.
