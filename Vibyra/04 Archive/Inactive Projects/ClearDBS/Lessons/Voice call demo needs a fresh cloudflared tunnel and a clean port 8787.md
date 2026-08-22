---
title: Voice call demo needs a fresh cloudflared tunnel and a clean port 8787
type: lesson
project: ClearDBS
date: 2026-07-06
status: active
tags:
  - lesson
  - project/cleardbs
  - project/relayclarity
---

# Voice call demo needs a fresh cloudflared tunnel and a clean port 8787

## Rule

For the ClearDBS phone-call demo (Twilio → OpenAI Realtime), `PUBLIC_BASE_URL` must be a **live** public https tunnel started with `npm run tunnel` (cloudflared). Never use localhost.run, and never reuse yesterday's tunnel URL.

## Evidence

On 2026-07-06, phone calls hung up mid-connect because localhost.run URLs silently change on reconnect, and an old dead `lhr.life` URL was still in `.env`. Separately, servers left running in `Desktop\test zoom project` kept stealing port 8787 from the real backend.

## How to apply

From `C:\Users\Ellis\Desktop\clear dbs`:

1. Kill any process on 8787 (especially terminals rooted in `test zoom project`).
2. `npm run server` (backend, port 8787; call page at http://127.0.0.1:8787/call).
3. `npm run tunnel` → copy the `trycloudflare.com` URL into `PUBLIC_BASE_URL` in `.env` → restart the server.
4. Phone bridge lives in `server/telephony/media-bridge.tsx`; persona/tools in `server/ai/client.tsx`; knowledge in `server/data/knowledge-base.json`.

Browser-only voice calls work without the tunnel; only real phone calls need it.

## Prompt impact

When asking for phone-call debugging, state up front: "PUBLIC_BASE_URL must be a fresh cloudflared tunnel; check port 8787 isn't held by the old test zoom project copy before touching code."
