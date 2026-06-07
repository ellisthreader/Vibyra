# Backend - Railway Cloud Runtime

Plan name: Vibyra Interactive Demo Runtime.

Purpose: let any Explore user open a hosted, interactive demo of a published project that shows the main frontend and backend behavior without requiring the creator's PC, local files, localhost, or desktop bridge after publish.

## Product Goal

Current local preview works because the creator's phone talks to the creator's PC and local server. Other Explore users cannot access that environment. Published projects need a Vibyra-hosted demo path that can show real pages, routes, API behavior, and app flows.

Target flow:

`Creator publishes project -> Vibyra creates safe static/demo artifacts -> Railway builds/runs only when a server runtime is needed -> Explore opens the best available hosted demo`

This is not a promise of production-perfect 1:1 hosting. The target is interactive demo hosting: frontend screens, routing, API routes, mock/demo data, safe demo checkout/account flows, logs, status, and public access.

Production-only features such as real payments, real auth, private business APIs, email delivery, persistent production databases, and creator-owned secrets are out of MVP unless explicitly configured later.

## Provider Decision

Use Railway as the deployment/runtime provider because the project owner already has a Railway subscription.

Railway should own hosted app runtime, build/install/start execution, public app URLs, logs, basic scaling/runtime infrastructure, and service process hosting for projects that need backend/server behavior.

Vibyra should own collecting project files from the creator's desktop, excluding unsafe/private files, detecting stack and commands, choosing static hosting versus Railway runtime, creating deployments through a verified Railway upload mechanism, storing provider identifiers, showing deployment status in mobile, opening the best hosted demo URL in Explore, and preserving Vibyra safety checks before deployment.

Default hosting policy: use cheap static artifacts/CDN-style hosting when a project can be represented as a frontend demo; use Railway only for projects that need server routes, SSR, API handlers, or a Node process to show the main experience.

## Non-Negotiable Behavior

- Explore users must never connect to the creator's PC.
- Public app URLs must never point at localhost, LAN IPs, desktop bearer URLs, or bridge routes.
- Creator local preview remains for build/test while paired to desktop.
- Public Explore preview opens the latest working hosted demo, which may be static or Railway-backed.
- If Railway deployment is not live, Explore falls back to the last working static/demo artifact when available, otherwise it shows a calm building/failed/unavailable state.
- Unsafe projects still block; temporary publish-review bypasses must not become permanent deployment policy.
- Railway services must not be created for every published project by default.
- Full production behavior is not guaranteed for payments, auth, external APIs, databases, storage, email, background workers, or custom infra.
- The iOS app must not download or execute native code from published projects.
- Published projects are hosted web demos opened over HTTPS, not extensions that change Vibyra's native App Store binary.

## MVP Scope

First supported project types:

- static HTML
- Vite/React
- Next.js basic app
- Express/Node full-stack apps
- common Node projects with `package.json`

First supported demo behaviors:

- browse pages and client routes
- run safe API routes or mock API handlers
- use demo data for lists, products, dashboards, carts, and admin-like flows
- support fake checkout/order/account flows when real secrets are missing
- show "demo mode" for disabled production-only features

Later support:

- Laravel/PHP
- Python/FastAPI/Flask
- databases
- env var setup
- persistent storage
- background workers
- custom domains/subdomains
- real payment/email/OAuth integrations with explicit creator-provided secrets and approvals

## Architecture

Desktop prepares a publish bundle from the selected project. Include source files needed to build/run or create a static demo, `package.json`, lockfiles, public/static assets, framework hints, detected build command, detected start command, detected runtime need, demo-mode hints, and optional generated preview media.

Exclude `.git`, `node_modules`, `.env` and env variants, secrets/credential files, build caches, Vibyra agent temp folders, and large generated output unless specifically needed. Bundle validation should enforce size caps, file count caps, secret scanning before upload, and clear failure reasons.

Add hosted demo/deployment records connected to `published_projects`.

Suggested fields:

- `id`
- `published_project_id`
- `user_id`
- `provider`: `static`, `railway`
- `provider_project_id`
- `provider_service_id`
- `provider_deployment_id`
- `status`: `queued`, `uploading`, `building`, `starting`, `live`, `failed`, `stopped`, `static_live`
- `provider_status`
- `hosting_mode`: `static`, `railway`, `demo`
- `demo_mode_enabled`
- `disabled_features`
- `stack`
- `build_command`
- `start_command`
- `public_url`
- `last_error`
- `latest_logs_summary`
- timestamps

Keep the latest successful hosted demo separate from the latest attempted deployment so Explore does not break if a redeploy fails.

For scale, most approved projects should store a static/demo artifact first. Railway deployments should be created on demand only when static hosting cannot show the main experience.

## Scale Model

The realistic target is hundreds of published projects available in Explore, not hundreds of always-on Railway services.

Default serving tiers:

1. Static/demo artifact: cheap default for frontend-heavy projects and fallback previews.
2. Sleeping/stopped Railway demo: for projects needing backend behavior but not currently popular.
3. Active Railway demo: for recently opened, popular, or creator-tested projects.

Queue and limit builds:

- serialize or batch Railway deployments instead of allowing unlimited concurrent builds
- cap active Railway-backed demos per user and plan
- cap total Railway-backed demos per workspace until billing is understood
- keep popular demos warm and let inactive demos sleep or stop
- preserve the latest static/demo artifact for every public project so Explore never depends only on a live container

Example scale target: 500 published projects can be realistic if most are static/demo artifacts, a smaller set have Railway deployments, and only the active/popular subset is awake at once.

## Backend APIs

Private/authenticated:

- `POST /api/projects/{projectId}/deployment`
- `GET /api/projects/{projectId}/deployment`
- `GET /api/deployments/{deploymentId}/logs`
- `POST /api/deployments/{deploymentId}/retry`
- `POST /api/deployments/{deploymentId}/stop`

Public/Explore:

- `GET /api/community/projects` includes hosting mode, deployment status, and public URL when live.
- Explore opens the hosted demo URL for live projects.
- Fallback order: latest live Railway URL, latest static hosted demo URL, existing preview HTML, unavailable state.

Implemented backend baseline:

- `published_project_deployments` stores static/demo/Railway deployment attempts for `published_projects`, including provider IDs, `hosting_mode`, `status`, `public_url`, `entry_path`, `demo_html` or `demo_files`, metadata, errors/log summaries, and `hosted_at`.
- `PublishedProject` has `deployments`, `latestDeployment`, and `latestSuccessfulDeployment`; API payloads expose `hostingMode`, `deploymentStatus`, `publicUrl`, `previewUrl`, and `appUrl`.
- Approved public publishes create a `static_live` deployment from sanitized `preview_html` or a validated `hostedDemo` bundle at `/api/community/projects/{slug}/demo`; under-review/denied publishes do not replace the latest successful demo.
- `/api/community/projects/{slug}/demo/{path?}` serves only approved successful deployment HTML/files with locked-down headers. `/preview` remains the inert fallback route.
- Railway config lives in `config/services.php`, but no Railway upload is implemented yet. Do not synthesize a Railway `publicUrl` unless a real provider URL has been resolved.

Current implementation review, 2026-06-06:

- Mobile publishing already asks desktop for `/files/publish-demo-bundle`, sends `previewHtml`, `hostedDemo`, screenshots, source review files, and visibility to `POST /api/projects/publish`.
- Desktop `publishDemoBundle.mjs` builds a bounded static runtime bundle from a discovered browser entry, follows asset references, excludes private/secret paths, and caps files/bytes. If no built entry exists but a `package.json` `build` script is present, desktop publish capture can install missing Node dependencies once with lifecycle scripts disabled, runs the build with timeouts, and retries static bundle capture; local dev preview working alone still does not make a public Explore demo.
- Backend stores and serves approved static demo bundles as `static_live` deployments and exposes `hostedDemoUrl`/`publicUrl`/`appUrl` in community payloads.
- Explore's opened-app page already opens the best available hosted/static/preview URL in `PublicDemoWebView` and shows ready/pending/failed/unavailable hosting status text.
- Native `AppWebView` uses `react-native-webview`; web uses an iframe. Both can render hosted demos, but the public demo surface still needs iOS device verification, stricter native WebView settings, and App Store review notes before submission.
- Node runtime MVP is wired: mobile can send a desktop `runtimeBundle` during publish; backend validates it, stores a queued `railway` deployment with source files in `demo_files`, and `vibyra:deploy-runtime-demos` uses `RailwayRuntimeDeploymentService` to upload the queued bundle with Railway CLI, generate/read a Railway domain, and mark it `live` only after a safe HTTPS URL is resolved. This supports Node/Express/Next-style demos first; Laravel/PHP, databases, secrets, persistent storage, and arbitrary full-stack hosting remain planned.

Railway production recovery, 2026-06-06:

- Railway project `spectacular-charisma`, environment `production`, service `Vibyra`, public URL `https://vibyra-production.up.railway.app`.
- The service must deploy from `ellisthreader/Vibeza` branch `codex/vibyra-mobile-auth` with Railway root directory `/backend`; the stale `ellisthreader/Vibyra` `main` deployment used old backend routes.
- Production needs a valid Laravel `APP_KEY`; an invalid key causes Laravel to fail before `/health` and Railway returns edge 502.
- The service domain target port is `8000`, so production must boot Laravel on `PORT=8000` (and `VIBYRA_BACKEND_PORT=8000` for generated connection URLs). A container listening on `8080` can pass internal startup but still return public 502 through the Railway domain.
- In this project, `railway redeploy --from-source` can fall back to `main`; reconnecting the source with `railway service source connect --service Vibyra --environment production --repo ellisthreader/Vibeza --branch codex/vibyra-mobile-auth` reliably triggers the correct branch build.
- Validation commands: `curl https://vibyra-production.up.railway.app/health` should return `{"ok":true,...}` and `curl https://vibyra-production.up.railway.app/api/community/projects` should return `{"ok":true,"projects":[],"comments":[]}` when there are no publishes.
- Runtime demo worker production setup: `backend/nixpacks.toml` installs `nodejs_20` and `@railway/cli`; `backend/railway.json`/`Procfile` start Laravel scheduler in the web container before `php artisan serve`; `routes/console.php` schedules `vibyra:deploy-runtime-demos --limit=1` every minute. Root `.railwayignore` is required when deploying from repo root so Railway can keep service root `/backend` without uploading `node_modules`, `tmp`, `.git`, or backend generated dependency/cache folders.
- Production variables required on Railway service `Vibyra`: `RAILWAY_API_TOKEN`, `RAILWAY_CLI_PATH`, `RAILWAY_RUNTIME_ENVIRONMENT=production`, and `RAILWAY_RUNTIME_PROJECT_PREFIX=vibyra-demo`. Verify inside the live container with `railway ssh --service Vibyra --environment production php artisan vibyra:deploy-runtime-demos --limit=1`; with no queued demos it should print `No queued runtime demos.`

## Railway Integration

Backend service should wrap Railway API calls behind a focused service:

- create or reuse Railway project/service for a published project
- upload/push source bundle through a verified mechanism
- set build/start configuration
- trigger deployment
- poll deployment status
- fetch logs
- resolve public URL

Railway's exact source upload path must be proven before implementation. If the Public API cannot upload source bundles directly, use a backend worker with Railway CLI/project tokens or another supported Railway deployment path rather than inventing an unsupported API.

The Railway API token should live only in backend `.env`, never mobile or desktop.

Required env:

- `RAILWAY_API_TOKEN`
- `RAILWAY_TEAM_ID` or workspace identifier if needed
- `RAILWAY_DEFAULT_REGION` if Railway supports/needs it
- deployment limits/config values

Mobile should not poll Railway directly. Mobile asks Vibyra backend for deployment status.

Cost controls are part of the runtime design: set usage limits, service resource limits, sleep/stop inactive apps where practical, and cap active Railway apps per user/plan.

## App Store Model

The App Store app is the Vibyra client, browser, and control surface. Railway/static hosting runs published projects on the internet.

App Store-safe flow:

1. Creator publishes from Vibyra.
2. Vibyra backend creates a static hosted demo or Railway-backed hosted demo.
3. Railway/static hosting exposes an HTTPS URL.
4. App Store users open Explore in the native Vibyra app.
5. Tapping a project opens the hosted demo in a constrained WebView or external browser view.
6. The hosted demo cannot install native code, modify the Vibyra binary, or gain native iOS API access by default.

Apple Review guardrails:

- Treat published projects as moderated hosted web demos/content.
- Do not present projects as separate native apps installed inside Vibyra.
- Do not let hosted demos change Vibyra's native features or App Store-reviewed behavior.
- Use HTTPS only.
- Keep WebView permissions minimal; camera, microphone, location, photos, contacts, Bluetooth, local network, and file access are off unless a later reviewed flow explicitly allows them.
- Provide content moderation, reporting, blocking, and review/removal paths for Explore projects.
- Keep metadata for hosted demos visible and accurate so Apple review can inspect the experience.
- Disable or demo-mode real-money payments, paid digital goods, gambling, donations, or external purchase flows unless the app has a reviewed Apple-compliant purchase path.
- Keep Vibyra account/session tokens isolated from hosted demos.
- Document in App Review notes that Explore opens hosted web demos and does not download or execute native iOS code.

Relevant Apple rules to check before submission: App Review Guideline 2.5.2 on downloaded/executed code and Guideline 4.7 on HTML5/JavaScript mini apps and similar hosted software.

## Mobile UX

Publish flow states:

- Uploading project
- Checking project
- Preparing demo
- Creating deployment
- Building on Railway
- Starting app
- Live in Explore
- Failed to deploy

Keep UI simple: one primary publish action, one hosting status block, and logs/details only when failed or requested.

Use copy that sets the right expectation: "Interactive demo" or "Demo mode" instead of "production app" or "exact 1:1 copy".

Explore behavior:

- live deployment: open Railway URL
- static demo: open hosted static demo URL
- building: show "App is still building"
- failed: show "App could not be deployed"
- no deployment: show existing static preview fallback if available
- disabled production-only feature: show safe demo-mode behavior inside the app when possible

App Store viewer behavior:

- open hosted demos inside a constrained WebView/Safari-style view
- show project title, creator, report/block controls, and demo status around the viewer
- avoid native bridges from hosted demos into Vibyra unless explicitly designed and reviewed
- if a demo requests unsupported native capabilities, show an unavailable/demo-mode state instead of prompting for broad permissions

## Safety And Security

Before upload/deploy:

- deny known unsafe previews/source
- scan for secrets
- block `.env` and credentials
- block private desktop URLs
- cap bundle size
- cap file count

Runtime:

- Railway app must not receive Vibyra backend secrets
- Railway app must not receive creator desktop tokens
- no desktop bridge access
- no local network assumptions
- avoid sharing user auth/session tokens with hosted apps
- no real payment, email, OAuth, or external API secrets unless a later explicit env-secret approval flow exists
- hosted demos should prefer mock/demo data over production data
- hosted demos must not receive Vibyra user auth/session tokens by default
- hosted demos must not have direct access to iOS native APIs through a generic bridge

Public routing should isolate hosted apps from Vibyra API auth cookies/tokens. Prefer separate domain/subdomain from the main Vibyra backend.

Cost and abuse controls:

- per-user active Railway app limits
- per-user build frequency limits
- bundle size/file count/runtime caps
- CPU/RAM/egress limits by plan
- auto-stop or sleep inactive Railway apps where practical
- manual stop/remove controls for creators
- provider quota errors should fail calmly and preserve the last working demo
- moderation/reporting/blocking controls for App Store-hosted Explore content

## Failure Cases

Handle unsupported stack, missing build/start command, install failure, build failure, start failure, missing port, Railway API errors, Railway quota limits, oversized projects, detected secrets, unsafe content, missing env vars, unsupported production integrations, apps that cannot run without external services, WebView load failures, blocked App Store-incompatible features, and content reports/removals.

Creators should see failure logs. Explore users should see only a calm unavailable/building state.

## Implementation Phases

1. Static/demo artifact baseline: keep current publish safety checks, generate or host a safe static/demo artifact, and expose it in Explore as the cheap default.
2. Railway MVP for Node/web demos: backend hosting model, verified Railway upload/deploy path, deployment API routes, desktop bundle creation, mobile publish trigger, stored public URL, status/logs, and Explore opening live server demos.
3. Demo-mode adaptation: detect missing production dependencies and support safe fake checkout/account/order/API behavior where the project can run without real secrets.
4. App Store-safe viewer: constrained WebView/Safari-style viewer, report/block controls, permission isolation, demo metadata, and App Review notes.
5. Reliable redeploys and cost controls: preserve latest live demo during failed redeploys, retry, stop/remove, deployment history, clearer build log extraction, sleep/stop inactive services, and enforce plan limits.
6. Better stack detection: Vite/React, Next.js, Express, static HTML, monorepos with app directory selection.
7. Env vars and databases: user-provided env var UI, Railway database provisioning path, secrets storage in backend, clear approval before deploying projects needing env/database.
8. More runtimes: Laravel/PHP, Python, background workers, persistent storage, custom domains, real payment/email/OAuth integrations.

## Repo Touchpoints

Likely backend:

- `backend/routes/web.php`
- `backend/app/Http/Controllers/Concerns/CommunityPublishing.php`
- new deployment controller/concern
- new Railway service under `backend/app/Services/`
- new deployment model/migration
- `backend/config/services.php`
- focused tests under `backend/tests/Feature/`

Likely desktop:

- `desktop/lib/projects.mjs`
- desktop file/browse routes
- new bundle/review route or extension of existing review bundle

Likely mobile:

- `src/utils/communityApi.ts`
- `src/screens/workspace/inline/ProjectPublishModal.tsx`
- `src/screens/workspace/inline/chunk12.tsx`
- `src/screens/workspace/inline/chunk14.tsx`
- `src/screens/workspace/inline/chunk15.tsx`
- publish status/result components
- Explore hosted-demo viewer/WebView component
- report/block controls for hosted demos

## Validation Plan

- Static/demo artifact tests.
- Backend fake Railway API tests for deployment creation/status/logs.
- Secret exclusion tests.
- Failed deployment tests.
- Demo-mode missing-secret tests.
- Cost/limit enforcement tests.
- Desktop bundle inclusion/exclusion tests.
- Mobile publish status tests.
- Explore opens live hosted demo URL.
- App Store-safe viewer tests: no generic native bridge, HTTPS only, permission-denied behavior, report/block controls present.
- Scale tests for deployment queueing, active Railway app caps, sleeping/stopped fallback, and latest static artifact fallback.
- End-to-end: publish static HTML, Vite, and Express demo apps; verify another user/device can open the main app flows without project files or creator desktop access.
- Ecommerce demo E2E: browse products, view product detail, add to cart, open checkout UI, and place a fake demo order without real payment credentials.

## Open Questions

- Railway API exact upload/deploy mechanism to use for source bundles.
- Whether Vibyra should create one Railway project per published app or one Railway project with multiple services.
- How to map Railway public URLs into Vibyra Explore URLs.
- What bundle size limits to start with.
- How much env/database support belongs in MVP.
- Whether deployments should be stopped for inactive apps to control cost.
- Where static/demo artifacts should be stored and served.
- How Vibyra should detect and communicate demo-mode substitutions.
- Which plan levels can create active Railway-backed demos.
- Whether hosted demos should open in in-app WebView, SafariViewController, external browser, or a hybrid based on risk.
- What exact App Review notes and reviewer test account/project data should be submitted.
- How aggressive auto-sleep/stop should be before cold starts make Explore feel broken.

## First Build Recommendation

Build the static/demo artifact baseline first, then add Railway-backed Node demos for projects that need server behavior, then add the App Store-safe hosted-demo viewer before public iOS release. Keep the data model and UI language generic enough for hosted interactive demos, but do not promise exact production replicas or overbuild databases/custom domains until the basic publish-to-hosted-demo flow works.

## Current Implementation

The static/demo artifact baseline is implemented before Railway source deployment. Desktop exposes authenticated `GET /files/publish-demo-bundle?projectId=...` from `desktop/lib/publishDemoBundle.mjs`, separate from `/files/review-bundle`, to collect a capped static browser bundle while excluding generated/private/env/credential files.

Backend stores hosted attempts in `published_project_deployments` via `PublishedProjectDeployment`. Public approved publishes create `static_live` records from a desktop `hostedDemo` bundle when present, otherwise from sanitized `preview_html`. Explore payloads include `hostingMode`, `deploymentStatus`, `publicUrl`, `previewUrl`, and `appUrl`; `/api/community/projects/{slug}/demo/{path?}` serves the latest successful static bundle and preserves that latest success when a newer Railway attempt fails. Railway config exists in `backend/config/services.php`, but Railway source upload is still intentionally stubbed until the exact supported deployment path is proven.

Production backend URL is `https://vibyra-production.up.railway.app`. Root `.env` points `EXPO_PUBLIC_API_URL` and `VIBYRA_API_URL` there for app/desktop calls. `scripts/start-dev.sh` preserves HTTPS `EXPO_PUBLIC_API_URL` values unless `EXPO_PUBLIC_API_MODE=local` is set, and `Vibyra Desktop` sources root `.env` before starting. Railway must start Laravel with `php artisan config:clear && php artisan route:clear && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=$PORT` because Railway assigns the runtime port dynamically, build-time config caching can freeze missing runtime env values such as `APP_KEY`, and a fresh Railway database needs migrations before session-backed routes can answer. Deployment config is committed in `backend/Procfile`, `backend/railway.json`, `backend/nixpacks.toml`, and root `railway.json`; root config runs through `cd backend` so it still works if the Railway service root is the repository root.
