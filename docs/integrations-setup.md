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

The integrations layer is still local work, which is why production answers
`GET /api/integrations` with `405`: the route does not exist there yet.

The new files are untracked:

```
backend/app/Services/Integrations  backend/app/Http/Controllers/IntegrationsController.php
backend/config/integrations.php    backend/database/migrations/2026_09_09_000002_create_vibes_integrations.php
backend/app/Console/Commands/SmokeIntegrations.php
backend/tests/Feature/IntegrationsTest.php  backend/tests/Feature/ConnectorOperationsTest.php
mobile/src/integrations  mobile/src/ui/IntegrationsScreen.tsx  mobile/src/demo/sampleIntegrations.ts
mobile/tests/integrationsApi.test.ts  mobile/tests/integrationsBrowserFixture.tsx
mobile/scripts/verify-integrations-ui.mjs
```

It is also wired in through tracked files that carry other uncommitted work, so
they ship together with it: `backend/routes/vibes.php`, `VibesController`,
`RunVibesTurn`, `Vibes/AgentTools`, `Vibes/Quotes`, and on the phone `App.tsx`,
`useWorkspace`, `WorkspaceApp`, `NavigationDrawer`, `BrandLogo`, `VibesComposer`
and `VibesScreen`.

The migration `create_vibes_integrations` has to run on deploy; connected keys are
stored encrypted in that table. The app has no over-the-air updates, so people
get the Integrations screen only through a new App Store build.

## 2. Switch the feature on

On Railway, set:

```
INTEGRATIONS_ENABLED=true
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
php artisan integrations:smoke                 # reads only
php artisan integrations:smoke --write         # reads and one real write each
php artisan integrations:smoke github          # just one
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
