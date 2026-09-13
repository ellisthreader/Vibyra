# Turning the integrations on

Two integrations are built and tested: GitHub and Stripe. Both connect with a key
the person pastes into the app, so nothing is set up per user and no provider has
to approve Vibyra. Each can change exactly one thing, listed below and printed on
its own page in the app under **Changes**.

Gmail, Google Calendar, Notion, Todoist, Linear, Sentry and Vercel were removed on
2026-09-11, along with the Google sign-in flow that only Gmail and Calendar used.
Gmail in particular needs Google's restricted-scope review and a yearly paid
security assessment before anyone outside a 100-person test list can connect it.

## 1. Ship the backend and the app

Production runs `release/0.6.3-macos`, deployed by uploading a checkout with
`railway up` rather than from GitHub. The launch branch `launch/vibes-on-release`
is that release line plus the Vibes chat backend, these connectors and the new
phone app, so deploying it adds the chat without rolling back any desktop,
website or updater work. Deploy it from that branch's checkout only.

In code these are **chat connectors**, not integrations: `release/0.6.3-macos`
already has a separate, live Integrations feature (OAuth connections for the
desktop agents under `/api/integrations`, `IntegrationsController`,
`config/integrations.php`, `App\Services\Integrations`). Ours lives under
`/api/connectors`, `ChatConnectorsController`, `config/chat_connectors.php` and
`App\Services\ChatConnectors`, and is switched on by `CHAT_CONNECTORS_ENABLED`.
The phone still calls the destination "Integrations".

The migration `create_vibes_integrations` runs on deploy (the start script runs
`migrate --force`); connected keys are stored encrypted in that table. The chat
also needs `VIBES_ENABLED=true`. The app has no over-the-air updates, so people
get the Integrations screen only through a new App Store build.

## 2. Switch the feature on

On Railway, set:

```
CHAT_CONNECTORS_ENABLED=true
```

It is one switch for every account. Until it is set the catalogue still lists
both - it is a menu, and reads fine signed out - but connecting is refused with
"Integrations are not switched on for this account yet."

## 3. What each person does

**GitHub** - https://github.com/settings/personal-access-tokens/new

- Resource owner: their own account or one organization. A token reaches one
  owner, and an organization may have to approve it.
- Repository access: all, or the ones they pick.
- Permissions: Contents read, Pull requests read, Issues read and write (read
  only if they never want it to open issues). Without Issues read, searching
  skips every issue in a private repository.
- Paste the `github_pat_…` token. The page then says "Connected as @name".

**Stripe** - https://dashboard.stripe.com/apikeys, then **Create restricted key**

- Balance read, Charges read, Customers write. Everything else None.
- Paste the `rk_live_…` key. An `rk_test_…` key from test mode works the same
  way and is the safe first try.

## 4. Prove them against the real services

```
php artisan connectors:smoke                 # reads only
php artisan connectors:smoke --write         # reads and one real write each
php artisan connectors:smoke github          # just one
```

It reads credentials from the environment, stores nothing, and prints a pass/fail
row per operation. Reads are safe to run any time. `--write` creates real objects,
labelled "Vibyra smoke test" so they are easy to find and undo.

| Integration | Credential variable | What it needs | The write it proves |
| --- | --- | --- | --- |
| GitHub | `SMOKE_GITHUB_TOKEN` | fine-grained PAT, Issues: write | opens an issue in `SMOKE_GITHUB_REPOSITORY` |
| Stripe | `SMOKE_STRIPE_KEY` | restricted key, Customers: write | creates `SMOKE_STRIPE_EMAIL` as a customer |

## What each one can change

Every write is the narrowest useful one the provider offers, and neither can undo,
delete or overwrite anything that was already there.

| Integration | Its one write |
| --- | --- |
| GitHub | Opens an issue. Never closes, edits or comments on one, and never touches code. |
| Stripe | Creates a customer record. **Moves no money** - no charges, refunds, payouts or subscriptions - and never makes a second customer for an email that already has one. |
