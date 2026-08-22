---
title: RealEstate Context Map
type: memory
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - project/realestate
  - ai/context
  - memory
---

# RealEstate — Context Map

Use the smallest useful note set before opening repository files.

## Routing

- **Any RealEstate task:** read [[Project Context]].
- **Public site, map, assets, loading, visual work:** add [[Frontend Context]].
- **Cross-package or data-model work:** add [[Architecture]].
- **Local startup, blank pages, stuck loading, API/database failures:** add [[Runbook]].
- **Why an implementation exists:** search [[Decisions]].
- **Planning or handoff:** read [[Current Status]].
- **Interview, portfolio, employer, presentation, or demo work:** read [[Interview Demo Context]] and [[02 Areas/Technical Career Evidence|Technical Career Evidence]].
- **Verified brand/content facts:** route to [[01 Projects/Gilbert and Rose Website Research/Gilbert and Rose Website Research|Gilbert and Rose Website Research]].

## Repository-first rules

1. Read `AGENTS.md` before changing code.
2. Inspect `git status --short`; the worktree contains user-owned concurrent changes.
3. Read the directly affected files and tests.
4. Keep changes within architecture boundaries.
5. Run the four required repository checks and affected integration/E2E checks.
6. Report changed files, tests, commands, results, limitations, and the recommended next task.

## High-value entry points

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/public/PropertyMap.tsx`
- `apps/web/src/pages/public/PublicPropertiesPage.tsx`
- `apps/web/src/staticAssetWarmup.ts`
- `apps/api/src/public/public.controller.ts`
- `packages/shared-types/src/dtos.ts`
- `packages/validation/src/property.ts`
- `packages/database/prisma/schema.prisma`
