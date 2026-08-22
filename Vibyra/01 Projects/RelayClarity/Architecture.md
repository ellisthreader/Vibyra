---
title: RelayClarity Architecture
type: architecture
project: RelayClarity
status: active
tags:
  - ai/context
  - architecture
  - project/relayclarity
---

# RelayClarity â€” Architecture

> [!info] AI quick context
> Technical map for RelayClarity. Pair this with [[01 Projects/RelayClarity/Project Context]] and check [[01 Projects/RelayClarity/Decisions]] for durable constraints before implementation.

See [[RelayClarity Memory]]. Repo: `/home/ellis/Desktop/RelayClarity`.

## Stack

- **Frontend**: React 19 + TypeScript on Vite 5, Tailwind v4 (`@tailwindcss/vite`), framer-motion.
- **Backend**: TypeScript Express 5 via `tsx`; SQLite (`better-sqlite3`); `openai` SDK.
- **Video**: Remotion (`remotion/`) for the launch marketing video.
- Node `20.x`, ESM.

## Scripts (package.json)

- `npm run dev` â†’ `node scripts/dev.mjs`: starts backend (`:8787`) if not up, then Vite client (`:5173`); reuses an existing backend via `/api/health`.
- `npm run server` â†’ `tsx server/start.tsx`; `npm run client` â†’ `vite --host 0.0.0.0 --strictPort`.
- `npm test` â†’ `tsx --test` over the `*.test.tsx`/`.test.ts` files; `npm run typecheck` â†’ `tsc --noEmit`.

## Frontend

- `src/main.tsx` â€” the **entire** React app (landing + dashboard, single large file). Timeline: `WorkflowPinnedTimeline`, `WorkflowTimelineChapter`, `WorkflowScrollLine`.
- `src/styles.css` â€” all CSS (Tailwind layer + hand-written). Timeline CSS ~line 23200+.
- `src/business-type-matcher.ts` + `src/business-category-data.ts` â€” business-type autocomplete.

## Backend (`server/`)

- `start.tsx` / `index.tsx` entry + wiring; `config.tsx`, `auth.tsx`, `types.tsx`.
- `ai/`: `orchestrator.tsx`, `client.tsx`, `schema.tsx`, `workspace.tsx`, `risk-scoring.tsx`.
- `voice/elevenlabs.tsx` â€” speech synthesis. `telephony/`: `outbound.tsx`, `audio-store.tsx`.
- `zoom/webhook.tsx` â€” Zoom Contact Center webhook. `adapters/`: mockable `crm/helpdesk/kb/integrations`.
- `providers/status.tsx`.

## Config / git

- `.env`: `OPENAI_*`, `ELEVENLABS_*`, `ZOOM_*`, `TWILIO_*`, `PORT=8787`, `ALLOWED_ORIGIN`.
- Git remote `ellisthreader/test-zoom-project`, main branch `main`.
