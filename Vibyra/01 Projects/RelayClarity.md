---
type: project
status: active
priority: 2
stack:
  - React
  - Vite
  - TypeScript
  - Express
project_path: /home/ellis/Desktop/Zoom project
repository: https://github.com/ellisthreader/test-zoom-project
last_commit: 2026-06-23
next_action: Confirm timeline scroll indicator with user; optionally make rail bolder
tags:
  - project/relayclarity
---

# RelayClarity

Product showcase + working backend for a voice-agent **deployment** platform (pilot → production),
framed for a Zoom Applied AI Engineer role.

## Links

- [Open project folder](file:///home/ellis/Desktop/Zoom%20project)
- [Open repository](https://github.com/ellisthreader/test-zoom-project)
- [Open README](file:///home/ellis/Desktop/Zoom%20project/README.md)

## Memory (scoped, in this global vault)

- [[RelayClarity Memory]] — entry point / read order
- [[RelayClarity/Project Context]]
- [[RelayClarity/Architecture]]
- [[RelayClarity/Decisions]]

## Commands

```bash
cd "/home/ellis/Desktop/Zoom project"
npm run dev        # backend :8787 + Vite client :5173
npm test           # tsx --test
npm run typecheck  # tsc --noEmit
```

## Current Focus

- [ ] Confirm the timeline blue scroll-progress line with the user (see RelayClarity/Runs).
