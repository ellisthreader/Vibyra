# Agent account integrations

The entry point is **Agent page → Integrations**. Choose a service, continue in
the system browser, then enable the connected account for that teammate. Connecting
an account alone does not grant access. **Check** performs another provider read;
**Disconnect** removes the connection and all teammate/device grants from Vibyra.
Remove Vibyra in the provider's account settings too when revoking the installation.
Existing Settings AI logins and `gh` CLI authentication are independent.

## Server setup

Use a dedicated set of provider registrations, separate from Vibyra identity login
and Vibyra's own Stripe billing. Store secrets only in the backend runtime's secret
configuration. Never put them in Vite variables, desktop settings, source, chat or logs.
Set the canonical HTTPS `APP_URL`, protect/back up `APP_KEY`, and use a persistent,
shared database plus a shared atomic-lock cache (Redis recommended). All backend
workers must use the same cache; process-local/file caches across replicas are unsafe
for Shopify's single rotating installation token. Laravel encrypted casts own token
storage; a managed KMS envelope vault is a future hardening step, not implemented here.

Deploy migrations before enabling the desktop capability:

```sh
php artisan migrate --force
php artisan config:cache
php artisan integrations:check
```

`integrations:check` prints presence/readiness and callback addresses, never secrets.
It exits nonzero for missing registration configuration. It does not test real OAuth.

Until at least one provider is registered the desktop **Integrations** button does
not appear at all, so a release can ship ahead of provider setup without offering
people nine rows they cannot use. The button appears on its own once the backend
reports a ready provider; each teammate header rechecks every five minutes, so no
new desktop release is needed after the registrations land. An account that is
already connected keeps the button visible even if a registration is withdrawn,
so existing access stays reviewable and removable.
Run it in the intended backend environment; local results say nothing about hosted secrets.

| Family | Backend environment variables | Provider setup |
| --- | --- | --- |
| Google | `INTEGRATIONS_GOOGLE_CLIENT_ID`, `INTEGRATIONS_GOOGLE_CLIENT_SECRET` | Web OAuth client; enable Gmail, Calendar and Drive APIs; consent screen and test users/verification for requested scopes. |
| Microsoft | `INTEGRATIONS_MICROSOFT_CLIENT_ID`, `INTEGRATIONS_MICROSOFT_CLIENT_SECRET` | Entra web client; personal and organisational accounts if both advertised; delegated Graph permissions; client secret expiry monitoring. Tenant policies may require administrator consent. |
| Stripe Apps | `INTEGRATIONS_STRIPE_CLIENT_ID`, `INTEGRATIONS_STRIPE_DEVELOPER_KEY`, `INTEGRATIONS_STRIPE_INSTALL_URL`, `INTEGRATIONS_STRIPE_MODE` | OAuth Stripe App; copy the complete mode-specific OAuth install link from Stripe; use the matching app developer key. Set mode to `test` or `live`. Allow payment-intent read permission. Public use requires Stripe app publication; external test links are for approved test accounts. |
| Shopify | `INTEGRATIONS_SHOPIFY_CLIENT_ID`, `INTEGRATIONS_SHOPIFY_CLIENT_SECRET` | Standalone app with `read_products,read_orders`; expiring offline tokens; configure approved distribution and any protected-data access required for the requested fields. API version is `2026-07`. |
| GitHub | `INTEGRATIONS_GITHUB_CLIENT_ID`, `INTEGRATIONS_GITHUB_CLIENT_SECRET` | OAuth App, `read:user` scope; current feature lists public repositories. This does not replace the existing broader `gh` connection or implement a GitHub App. |

Register **each** applicable exact redirect URL below on the provider registration,
replacing `https://YOUR-BACKEND` with the canonical `APP_URL`:

```text
https://YOUR-BACKEND/api/integrations/callback/gmail
https://YOUR-BACKEND/api/integrations/callback/google-calendar
https://YOUR-BACKEND/api/integrations/callback/google-drive
https://YOUR-BACKEND/api/integrations/callback/outlook
https://YOUR-BACKEND/api/integrations/callback/microsoft-calendar
https://YOUR-BACKEND/api/integrations/callback/onedrive
https://YOUR-BACKEND/api/integrations/callback/stripe
https://YOUR-BACKEND/api/integrations/callback/shopify
https://YOUR-BACKEND/api/integrations/callback/github
```

Google and Microsoft consent is per service; connecting Calendar does not request
mail or Drive access. Gmail and Drive metadata scopes still have Google's production
verification requirements. Users choose their external account in the provider's UI.
Stripe environment is checked against the token response, not trusted from the callback.

For Shopify, register `app/uninstalled`, `customers/data_request`, `customers/redact`
and `shop/redact` at `/api/integrations/shopify/webhook`. HMAC is checked over the raw
body. This broker does not persist customer/order read results; uninstall/shop redaction
removes credentials and grants. Signed duplicate deletion deliveries are idempotent; body shop identity and event time prevent wrong-store routing and late deletion of a reconnected account.
The initial design permits one Vibyra account to own a Shopify installation; devices
and teammates share that connection's server token. Another Vibyra account cannot
replace its token. Team-wide ownership sharing is a future capability.

## Required live acceptance

For every enabled service: start sign-in from the packaged modal; select a real test
account; consent; see the verified account identity; enable it for one teammate; use
`integration_accounts` and `integration_read` through both Claude and Codex; compare
with provider data. Confirm a different teammate/device is denied until assigned.
Test revoke/reconnect, declined access, cancellation, restart and token expiry. For
Stripe use test mode first. For Shopify use a development store and signed uninstall.
Repeat on Windows before advertising Windows support; Linux fixture checks are not
packaged cross-platform evidence. Never label mock responses as live provider proof.

## Architecture and recovery

`POST /api/integrations/rpc` authenticates the Vibyra session. Its operation enum is
closed: list/start/poll/cancel/grant/disconnect/check/read. Provider URLs and actions
are fixed server-side. Callback attempts are account/session/service-bound, expiring
and one-use; poll is idempotent and returns safe metadata only. Auth URLs remain native.
Connecting may finish after the modal closes if the callback already won the lock;
this never enables a teammate automatically. The next modal load shows the account.

`integration_connections` stores encrypted credentials and safe identity metadata;
`integration_attempts` stores encrypted pending state/verifiers; `integration_grants`
keys access by connection, native installation ID and teammate ID. Account deletion
cascades these records. The existing Laravel scheduler prunes attempts
older than one day daily; they cannot authorize after expiry even before cleanup.

Provider-scoped atomic locks serialize reconnect against refresh; SQL row locks
serialize grants/read/disconnect. Rotated credentials commit even if a subsequent
provider data read fails. Provider rejection marks reconnect; outages preserve the
last connection. No remote write endpoints exist. Returned data is untrusted context,
not agent instructions. Stripe responses project reporting fields and exclude client
secrets/customer metadata. No provider access/refresh token is supplied to either engine.

## Official references checked 2026-09-07

- [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Stripe Apps OAuth](https://docs.stripe.com/stripe-apps/api-authentication/oauth)
- [Shopify access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)
- [Shopify PHP HMAC utility](https://github.com/Shopify/shopify-api-php/blob/main/src/Utils.php)
- [GitHub OAuth and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
