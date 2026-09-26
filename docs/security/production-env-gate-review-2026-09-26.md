# Production service gate review — 26 September 2026

Read-only review of Railway project `spectacular-charisma`, service `Vibyra`, environment `production`, against the 18 service findings in `production-security-audit.json`. The running deployment inspected was `2fbebed1-eb6a-48e8-9228-2eb6e8dc1881`. No environment variable, deployment, or database row was changed. Variable values and credentials are omitted.

## Inventory and required decision

All 18 audited service variables below are **absent** in Railway production. An absent audit value is not proof that a runtime feature is unsafe: several production defaults are already restrictive, and six audit-only flags have no corresponding source references in the current backend, phone, or Desktop code. Do not set a flag merely to make an audit row green.

| Variable(s) | Current runtime meaning | Release action |
| --- | --- | --- |
| `VIBYRA_CORS_ALLOW_ANY_ORIGIN`, `VIBYRA_CORS_ALLOWED_ORIGINS` | Production default is no wildcard and an empty browser origin allowlist. The same-origin site works; adding an origin expands cross-origin browser access. | Explicitly keep wildcard off. Inventory actual deployed HTTPS web origins and allowlist only those needed; test the browser flows and preflight response. Native clients do not need CORS. |
| `VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED` | `config/desktop.php` already disables legacy Desktop routes outside local/testing, even when this variable is absent. | Set explicit false only after checking no production client depends on those routes; verify the routes are absent. This documents an existing production restriction. |
| `VIBYRA_LEGACY_PHONE_TOKEN_ENABLED`, `VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED`, `VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED` | No runtime references in the current candidate backend or active native source; the audit alone names them. | Identify the actual token/proxy controls and test them. Add real enforcement or remove obsolete audit requirements in a separately reviewed security change. Values alone provide no protection. |
| `PUBLISH_REVIEW_TEMPORARILY_DISABLED` | Absent defaults to false; this specific bypass is inactive. | Set explicit false after verifying publishing behavior. Also address the **different active override** below. |
| `VIBYRA_PAIR_RATE_LIMIT_ENABLED`, `VIBYRA_LAN_V2_REQUIRED`, `EXPO_PUBLIC_LAN_V2_MODE` | No runtime references in the current candidate backend or active native source; the audit alone names them. | Map pairing and LAN transport to their actual controls and verify rate limiting and version rejection. Implement missing controls or independently revise the audit. Do not certify these by setting inert variables. |
| `OPENAI_MODERATION_ENABLED`, `OPENAI_MODERATION_FAIL_CLOSED` | Local moderation defaults on. Remote moderation defaults off; fail-closed defaults on *if remote is invoked*. An OpenAI API key is configured. | Treat remote moderation as a product/privacy/spend decision: confirm disclosure, budget, throughput, outage behavior, and provider call tests before enabling. If unavailable, a fail-closed decision may block community actions. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | No Stripe secret or webhook verification secret is configured; checkout and webhook cannot complete normally. | Decide if web billing is in release scope, then provision live credentials in Railway and verify a real low-value checkout, signed webhook, replay, refund/cancel flow. Do not use test-mode keys to satisfy production audit. |
| `APPLE_IAP_SHARED_SECRET` | Apple receipt verification lacks its secret. | Provision the real app-specific credential if Apple IAP is active; verify a sandbox and production-signed receipt flow. Review current Apple verification API strategy. |
| `GOOGLE_IAP_PACKAGE_NAME`, `GOOGLE_IAP_SERVICE_ACCOUNT_JSON` | Google Play receipt verification lacks package and service identity. | Provision only when Android billing is genuinely released; verify package match, service-account scope, purchase acknowledgment, replay handling, and Play test purchase. |
| `GOOGLE_AUTH_CLIENT_IDS` | This audited list is absent. A separate Desktop Google OAuth client ID is configured and added to backend audiences, so absence does not by itself prove Desktop login fails. | Inventory current website/iOS/Android Google token audiences, register exact approved client IDs, and run real login tests for each shipped surface. Never add a guessed ID. |

`VIBYRA_OWNER_EMAILS`, `MAXMIND_ACCOUNT_ID`, and `MAXMIND_LICENSE_KEY` are also absent. The first denies production owner access by default; the latter two leave country breakdowns unknown. `VIBYRA_ANALYTICS_INGESTION_ENABLED` is absent and defaults on **only once the candidate collector is deployed**. Set the owner allowlist and GeoLite2 credentials only during an approved release; no real product events are collected by the current deployment.

## Active publishing override — urgent additional finding

`PUBLISH_REVIEW_FORCE_APPROVE_UNDER_REVIEW` is **enabled** in the live Railway service. Read-only SSH confirmed the effective Laravel config is enabled in the running process, and the running image contains `ProjectSafetyReview::maybeForceApproveUnderReviewForTesting`. For a new publish whose deterministic decision is `UNDER_REVIEW`, this testing path can convert the result to `APPROVED` and `public`. Hard deterministic denials still block, and the switch does not retroactively approve old rows. This is distinct from `PUBLISH_REVIEW_TEMPORARILY_DISABLED`, which the existing audit checks.

The repository security audit now has a source-side check that requires `PUBLISH_REVIEW_FORCE_APPROVE_UNDER_REVIEW=false`; its focused test covers absent, true, and false without printing variable values. The prior stored audit result remains historical at 53 pass / 24 fail / 9 manual. With otherwise identical input, the new check adds a failure until the testing override is disabled.

A read-only production aggregate query found six current `published_projects` rows, four public/approved, and **zero current rows** whose stored `review_flags` include `temp_under_review_force_approved`; first/last matching review timestamps are therefore unavailable. This does not prove the override was never used: republishing can replace the current review flags, and older code may not have used this marker.

**Proposed production response:** have the release/incident owner disable the testing override under change control, verify the effective Laravel config after redeploy/restart, test that a crafted under-review submission stays private/pending, and review previously approved records carrying `temp_under_review_force_approved`. Assess whether any must be unpublished or re-reviewed, preserving evidence. Do not alter customer rows blindly. This production change was **not** made during this review.

## Release sequence

1. Assign an owner for each product decision and obtain the independent approval required by `docs/security/production-release-gates.md`.
2. Resolve the active publish override and inspect its historical impact. Reconcile obsolete audit-only flags with real controls in a reviewed source change.
3. Provision only genuine production credentials and explicit origins for released features. Keep secret values in Railway; evidence should record status and test receipts only.
4. Rerun `node scripts/security/audit-production-config.mjs --release --environment` against the exact protected release commit and production variable set. Confirm both the audit and effective runtime config, then exercise affected auth, billing, moderation, CORS, pairing, and publishing flows.
5. Preserve deployment ID, dated evidence, independent approver, rollback plan, and post-release smoke results. This runbook does not grant deployment approval.
