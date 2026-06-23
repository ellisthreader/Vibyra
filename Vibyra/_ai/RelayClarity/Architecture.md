# RelayClarity — Architecture

See [[RelayClarity Memory]]. Repo: `/home/ellis/Desktop/Zoom project`.

## Stack

- **Frontend**: React 19 + TypeScript on Vite 5, Tailwind v4 (`@tailwindcss/vite`), framer-motion.
- **Backend**: TypeScript Express 5 via `tsx`; SQLite (`better-sqlite3`); `openai` SDK.
- **Video**: Remotion (`remotion/`) for the launch marketing video.
- Node `20.x`, ESM.

## Scripts (package.json)

- `npm run dev` → `node scripts/dev.mjs`: starts backend (`:8787`) if not up, then Vite client (`:5173`); reuses an existing backend via `/api/health`.
- `npm run server` → `tsx server/start.tsx`; `npm run client` → `vite --host 0.0.0.0 --strictPort`.
- `npm test` → `tsx --test` over the `*.test.tsx`/`.test.ts` files; `npm run typecheck` → `tsc --noEmit`.

## Frontend

- `src/main.tsx` — the **entire** React app (landing + dashboard, single large file). Timeline: `WorkflowPinnedTimeline`, `WorkflowTimelineChapter`, `WorkflowScrollLine`.
- `src/styles.css` — all CSS (Tailwind layer + hand-written). Timeline CSS ~line 23200+.
- `src/business-type-matcher.ts` + `src/business-category-data.ts` — business-type autocomplete.

## Backend (`server/`)

- `start.tsx` / `index.tsx` entry + wiring; `config.tsx`, `auth.tsx`, `types.tsx`.
- `ai/`: `orchestrator.tsx`, `client.tsx`, `schema.tsx`, `workspace.tsx`, `risk-scoring.tsx`.
- `voice/elevenlabs.tsx` — speech synthesis. `telephony/`: `outbound.tsx`, `audio-store.tsx`.
- `zoom/webhook.tsx` — Zoom Contact Center webhook. `adapters/`: mockable `crm/helpdesk/kb/integrations`.
- `providers/status.tsx`.

## Config / git

- `.env`: `OPENAI_*`, `ELEVENLABS_*`, `ZOOM_*`, `TWILIO_*`, `PORT=8787`, `ALLOWED_ORIGIN`.
- Git remote `ellisthreader/test-zoom-project`, main branch `main`.
