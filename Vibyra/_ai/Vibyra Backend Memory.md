---
tags: [vibyra, memory, backend]
---

# Vibyra Backend Memory

Scope: Laravel backend in `backend/`. Use this as the backend index only.

## Mental Model

The backend is the cloud companion to the phone app. It owns auth, account/credits, cloud chat through OpenRouter, community publishing, and remote app-state persistence.

## Start Files

- `backend/routes/web.php`: route table.
- `backend/app/Http/Controllers/VibyraDesktopController.php`: aggregate controller using concern traits.
- `backend/app/Http/Controllers/Concerns/`: route behavior traits.
- `backend/config/services.php`: OpenRouter env config.
- `backend/config/billing.php`: plan/model/credit source of truth.

## Focused Notes

- `/api/chat`, OpenRouter request shape, skills, reasoning, token caps: `Backend/Chat And Cost Controls.md`
- `/api/chat/team-plan`, strict Team assignment proposals: `Backend/Team Planning.md`
- Detailed mobile AI live chat backend handoff: `Backend/AI Live Chat Backend Context.txt`
- Membership, Stripe/IAP, credits, level rewards: `Backend/Billing Credits And Levels.md`
- App auth, `/api/session/state`, cloud sync: `Backend/Auth And Cloud Sync.md`
- Public publishing, moderation, community assets: `Backend/Community Publishing.md`
- Public Explore hosted/static/Railway demos: `Backend/Hosted Demos.md`
- Deep hosted-demo/Railway product spec: `Backend/Railway Cloud Runtime.md`
- Desktop-agent backend route, locks, stale recovery: `Backend/Desktop Agent Backend.md`

## Concern Traits

Key traits in `backend/app/Http/Controllers/Concerns/`:

- `ChatEndpoint`, `ChatEndpointHelpers`, `ChatPrompting`, `ChatModelMap`
- `AgentExecution`, `AgentLocking`
- `ChatHistory`, `SessionState`
- `CommunityPublishing`

## Token Hint

For backend tasks, read this index plus exactly one focused backend note, then inspect only `VibyraDesktopController.php` and the relevant `Concerns/*.php` trait. Do not read `vendor/`.
