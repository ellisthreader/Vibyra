# Vibyra Backend

Laravel API for Vibyra's account, billing, cloud state, community, moderation, and AI chat features.

## Responsibilities

- Account signup, login, session refresh, device/session management, profile updates, and account deletion.
- Cloud state sync for the mobile app through `/api/session` and `/api/session/state`.
- Billing plans, checkout, customer portal, IAP receipts, credit ledgers, and usage limits.
- OpenRouter-backed chat, streaming chat, research planning, model access, and credit deduction.
- Community project publishing, hosted demos, comments, reactions, review queue, and moderation.
- Desktop bridge support routes for pairing, projects, files, previews, agent runs, and safe commands.

## Key Files

```text
routes/web.php                                  API and desktop route table
app/Http/Controllers/VibyraAppController.php    Mobile/backend product API
app/Http/Controllers/VibyraDesktopController.php Desktop bridge API
app/Http/Controllers/BillingController.php      Plans, checkout, portal, receipts, webhooks
app/Services/Billing/                           Credit calculation and billing behavior
app/Services/Community/                         Community publishing safety review
app/Services/Concerns/                          Desktop/project/agent/preview behavior
database/migrations/                            Account, billing, community, session schema
```

## Run Locally

From the repository root:

```bash
npm run backend
```

Or from this directory:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

The mobile app expects an API URL through `EXPO_PUBLIC_API_URL`. The root `npm start` script starts this backend and writes a LAN URL for Expo development when needed.
