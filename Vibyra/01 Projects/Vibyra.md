---
type: project
status: active
priority: 1
stack:
  - Expo
  - React Native
  - Tauri
  - Rust
  - Laravel
project_path: /home/ellis/Desktop/Vibyra
repository: https://github.com/ellisthreader/Vibyra
last_commit: 2026-08-20
next_action: Desktop integrations — multiple accounts per provider, live switching in terminals
tags:
  - project/vibyra
---

# Vibyra

Mobile command center for AI software workflows running on the user's own machine. Three surfaces: the Expo phone app (`src/`), the native Tauri desktop app (`desktop-tauri/`), and the Laravel backend + marketing website (`backend/`).

## Links

- [Open project folder](file:///home/ellis/Desktop/Vibyra)
- [Open repository](https://github.com/ellisthreader/Vibyra)

## Engineering memory lives in `_ai/`

This note is the human entry point. The working memory agents read and write is in `_ai/` — do not duplicate engineering detail here.

- [[_ai/Memory Protocol|Memory Protocol]] — how agents read and write this vault
- [[_ai/Context Map|Context Map]] — routing: which note to read for which task
- [[_ai/Project Context|Project Context]] — what Vibyra is, important files
- [[_ai/Product Surfaces|Product Surfaces]] — website vs browser client vs phone app vs desktop app
- [[_ai/Runbook|Runbook]] — how to run, build, and ship each surface
- [[_ai/Decisions|Decisions]] — decision log (deep reference, search don't read)

Domain indexes:

- [[_ai/Vibyra App Memory|App Memory]] → focused notes in `_ai/App/`
- [[_ai/Vibyra Desktop Memory|Desktop Memory]] → focused notes in `_ai/Desktop/`
- [[_ai/Vibyra Backend Memory|Backend Memory]] → focused notes in `_ai/Backend/`

## Current Focus

- [ ] Desktop integrations: add multiple accounts per provider, switch live in terminals
- [ ] Discord webhooks: OpenRouter model announcements + in-app bug reports
- [ ] Make the in-app updater actually ship (plugin, signing vars, release workflow)

## History

Pre-Tauri planning and the Electron-era desktop notes are in [[04 Archive/Vibyra Pre-Tauri (2026-06 to 07)/Desktop App Implementation Spec|04 Archive/Vibyra Pre-Tauri (2026-06 to 07)]].
