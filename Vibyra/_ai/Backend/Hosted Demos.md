# Backend - Hosted Demos

Read this for public Explore demos, static hosted bundles, Railway runtime demo
deployment, and App Store-safe demo URLs. Treat `Backend/Railway Cloud Runtime.md`
as the deep reference for the full product/spec history.

## Main Files

- `backend/app/Http/Controllers/Concerns/CommunityPublishing.php`
- `backend/app/Services/Deployments/`
- `backend/app/Models/PublishedProjectDeployment.php`
- `backend/config/services.php`
- `backend/routes/console.php`
- `desktop/lib/publishDemoBundle.mjs`
- `desktop/lib/publishRuntimeBundle.mjs`
- `src/utils/hostedDemo.ts`
- `src/utils/publicDemoUrls.ts`
- `src/components/PublicDemoWebView.tsx`

## Current Contract

Public Explore demos must not use creator desktop bridge URLs, localhost, LAN
IPs, bearer preview URLs, or private `.local` hosts in production. Use public
HTTPS hosted/static/demo URLs only.

Publishing can include a desktop `hostedDemo` static bundle and, for Node,
Laravel, or conventional Python Django/FastAPI/Flask apps, a `runtimeBundle`.
Python projects with a root requirements manifest, nested `backend/app/main.py`,
and a built Vite `frontend/dist` are packaged with generated
`_vibyra_runtime.py`, which serves the API and same-origin frontend together.
The client skips a duplicate static bundle when that runtime already contains
the frontend.
Backend stores deployment attempts and exposes `hostingMode`,
`deploymentStatus`, `hostedDemoUrl`/`publicUrl`/`appUrl`, explicit
`frontendStatus`, `backendStatus`, and `backendPlatform`, plus safe
unavailable/building/failed states in community payloads. Publish status
payloads also expose the latest attempt's `deploymentCreatedAt` and
`deploymentUpdatedAt`; mobile progress uses the status as its source of truth
and the timestamp only for bounded movement within the current stage.

Static hosted bundles are the cheap default. Railway-backed demos are for apps
that need server/runtime behavior. Preserve the latest successful hosted/static
demo when a newer deployment fails.

Release lifecycle contract (2026-06-09): publish payloads separate the current
openable release from the latest candidate attempt. `currentReleaseState` and
`currentPublicUrl` describe what users can still open;
`candidateReleaseState`, `candidateError`, and deployment timestamps describe
the update in progress. `listingState` may therefore be `live_updating` or
`live_update_failed` while `isDiscoverable` and `isOpenable` remain true.
Metadata-only listing edits preserve deployment rows, the current URL, and
`published_at`; only an explicit release publish creates a new candidate.

`PublicDemoWebView` is the community/opened-app viewer. It uses sanitized public
demo URLs and must show the clean unavailable panel when a demo is blocked,
missing, building, failed, or not publicly reachable.

## Railway Runtime

`vibyra:deploy-runtime-demos --limit=1` processes queued Railway deployments.
The production Railway service is `Vibyra` at
`https://vibyra-production.up.railway.app`, deployed from
`ellisthreader/Vibeza` branch `codex/vibyra-mobile-auth` with backend root.

Required production variables include `RAILWAY_API_TOKEN`,
`RAILWAY_RUNTIME_ENVIRONMENT=production`, and
`RAILWAY_RUNTIME_PROJECT_PREFIX=vibyra-demo`. Direct archive upload is the
default (`RAILWAY_RUNTIME_UPLOAD_MODE=direct`); `RAILWAY_CLI_PATH` and
workspace ids are only needed for the explicit `cli` fallback.

The worker provisions an isolated project/service/environment through GraphQL,
creates a short-lived project token, builds a gzip tar archive, and uploads it
to Railway's backboard `/project/{project}/environment/{environment}/up`
endpoint using the `project-access-token` header. Persist and poll the exact
returned deployment id; never infer success from an older service deployment.
`ProjectCreateInput` must use `workspaceId`, not the obsolete `teamId`; Railway
otherwise creates an orphan project that the workspace user cannot list or
deploy. Use the account token for workspace provisioning and cleanup, then use
the short-lived project token for archive upload, deployment polling, domain
queries/creation, and delete that token in `finally`. A new isolated service may
have no domain, so direct mode must call `serviceDomainCreate` before public
readiness checks.
CLI fallback must explicitly remove `RAILWAY_API_TOKEN` when using
`RAILWAY_TOKEN`, because Railway rejects processes with both credentials set.

Laravel runtime bundles are demo-mode source bundles, not full repo uploads.
`desktop/lib/publishRuntimeBundle.mjs` must include Composer/server files,
`resources/views`, `public/build`, `bootstrap/cache/.gitignore`, and generated
build assets, but exclude `.env`, `vendor`, `node_modules`, `package.json`,
frontend source under `resources/js`, user Railway/Nixpacks config, and
generated Laravel cache PHP. The deployment service also ensures
`bootstrap/cache/.gitignore` exists before upload. The generated Railway start
command must create `bootstrap/cache`, `storage/framework/{cache/data,sessions,views}`,
and `storage/logs` before Composer discovery or `php artisan serve`.

Do not write `APP_URL=https://${RAILWAY_PUBLIC_DOMAIN}` or a matching
`ASSET_URL` into an uploaded Laravel `.env`: Railway does not expand that
placeholder inside dotenv files, so Laravel emits literal or insecure asset
URLs. Patch the runtime entry point to honor `X-Forwarded-Proto: https` and let
Laravel derive the real public host from the request.

The Railway worker must not trust unrelated `railway status` URLs. For retries,
reuse saved provider project/service ids; for new deployments, fall back to
`railway list --json` by the generated project name when status lacks a root
project id. Mark a runtime deployment live only after its public HTTPS URL
responds with HTTP 2xx/3xx; fallback 404/502/500 means it is still starting or
failed and must not be surfaced as ready in Explore. Readiness must also reject
same-host `http://` references in HTML or `Link` headers and literal
`${RAILWAY_PUBLIC_DOMAIN}` output. Deployment 21 was recovered and verified
with secure assets on June 7, 2026 using these checks.

Runtime bundles are normalized before review, their actual text source is
reviewed, and pending static/runtime bundles remain stored until reviewer
approval. Generated browser build assets are validated as delivered files but
are excluded from source-risk heuristics. Full-stack runtime capability
reporting uses the declared `frontendDistDirectory`, so queued/live frontend
states are `pending`/`ready` rather than `unavailable`.

Do not treat a monorepo root `package.json` script such as
`"start": "npm run dev"` as sufficient proof of a deployable Node server. On
June 9, 2026 the `SaaS` Expo/Laravel monorepo root was misclassified as Node,
so the old desktop packager silently stopped at 320 files and submitted an
`ok: true` bundle containing skills, desktop files, Laravel source, and tests.
Backend normalization correctly rejected private `localhost`/LAN URL literals
and an empty asset, returning the generic “runtime bundle was incomplete or
unsafe” response. The current packager reports the file-cap failure instead,
but runtime detection should prefer the actual nested backend or reject broad
Expo/dev scripts rather than scanning the whole monorepo.

Runtime bundle size failures use the stable code
`runtime_bundle_limit_exceeded` and must tell the creator that the project is
too large for Vibyra hosting. The desktop packager, mobile publish flow, and
backend publish endpoint preserve that precise message instead of falling back
to “incomplete or unsafe.”

`PUBLISH_REVIEW_TEMPORARILY_DISABLED=true` is the explicit emergency launch
bypass for deterministic, local, remote, and AI publish-review decisions. It
still sanitizes preview HTML and does not bypass runtime/static bundle
integrity, size, path, or deployability validation. PHPUnit pins the switch off
so normal safety denial behavior remains covered.

Publishing transport contract (2026-06-09): React/Laravel and other browsed
projects use one canonical desktop source ID through file review, frontend and
runtime bundle capture, and backend submission. Mobile also forwards the
validated desktop project path so a stale opaque card ID can recover without
opening arbitrary folders. Backend preserves precise desktop failure codes,
derives frontend/backend readiness from accepted deployment contents, and
rejects private directories before queuing Railway.

Generated JavaScript in Laravel `public/build/assets` and declared Python
frontend dist directories may contain harmless library fallback literals such
as `http://localhost`. Normalize those compiled private URL literals to
`about:blank` before the public-URL safety check, matching static hosted-demo
behavior. Continue rejecting private URLs in runtime source files. On June 9,
2026 this false positive blocked the 123-file ReactLaravel bundle even though
the bundle was complete and within hosting limits.

Railway GraphQL provisioning errors must be preserved in deployment
`last_error` and `latest_logs_summary`. Do not collapse workspace permission,
quota, or token failures into only “isolated demo target could not be
provisioned”; the publish status UI relies on `candidateError` to tell the
creator what failed.

The publish modal must let a fresh request error override its status-only
screen. Render the immediate error as a danger status beside the retry action,
then await the status refresh; otherwise an existing queued status can hide the
actual API or provider failure. For local development, run pending migrations
before diagnosing publish behavior: a missing
`published_project_deployments` table makes community and publish-status
requests fail with HTTP 500 before any deployment attempt is recorded.

Runtime queue claims are atomic. Workers ignore queued rows whose project is no
longer public and approved. Republishing stops older queued/pending runtime
attempts but preserves the previous live demo until the replacement passes
provider and public HTTPS readiness checks.

Making a listing private, deleting it, replacing a live runtime, or exceeding
`RAILWAY_MAX_ACTIVE_DEMOS_PER_USER` immediately removes its public URL and
creates a durable `published_project_runtime_cleanups` row. The scheduled
`vibyra:cleanup-runtime-demos --limit=5` command atomically claims cleanup rows,
deletes Railway projects through GraphQL, and retries failures with backoff.

Production proof on June 9, 2026: `Service Priority AI` from
`/home/ellis/Desktop/AzureProject` is approved, listed in Explore, and live at
`https://azure-service-triage-ai-production.up.railway.app`. The root React
page, built JavaScript asset, and FastAPI `/health` endpoint all return HTTP
200; publish status reports both frontend and backend `ready`.

Direct-upload production proof on June 9, 2026: Laravel deployment 13,
`FoodPreviewStress`, was provisioned inside workspace
`f71cda0c-7d9e-4f49-9063-4b94b5438977`, uploaded without the Railway CLI,
polled by its exact deployment id, assigned a service domain, and marked live
at `https://vibyra-demo-13-production-7dc3.up.railway.app`. The public root
returns HTTP 200 with no literal `${RAILWAY_PUBLIC_DOMAIN}` or same-host
`http://` references.

Validation probes:

```bash
curl https://vibyra-production.up.railway.app/health
curl https://vibyra-production.up.railway.app/api/community/projects
```

If Railway returns public 502, first check `APP_KEY`, target port `8000`, root
directory `/backend`, and whether the source is still connected to the correct
repo/branch.

## Guardrails

- Do not deploy secrets, `.env`, desktop tokens, local bridge URLs, or private
  files.
- Keep Railway runtime demos demo-mode unless explicit secret/env/database
  support is added with approval.
- Do not expose hosted demos to native iOS capabilities through a broad bridge.
- App Store copy should say hosted web demos, not installed native apps.

## Publish Contract Tests

`desktop/lib/publishContractMatrix.test.mjs` and
`src/screens/workspace/inline/ProjectPublishContractMatrix.test.mjs` model
nested React/Vite plus Laravel, frontend-only React, Laravel/Inertia, Node and
Python full-stack apps, stale cache recovery, build failures, hosting limits,
and credential exclusion. Keep the desktop payload, mobile selection, and
backend acceptance contract aligned when changing publish behavior.

Two cross-layer boundaries require explicit coverage: bundle requests must
carry the canonical `projectPath` as a fallback for stale non-path project IDs,
and desktop runtime packaging must reject `secret`/`secrets` directories before
the backend converts an otherwise successful bundle into the generic unsafe
bundle error.

## Open Launch Blockers

Audit status on June 9, 2026: static and full-stack bundle generation, review,
pending approval persistence, direct unattended Railway archive upload, exact
deployment polling, atomic queue claims, active-demo limits, and durable
provider cleanup are implemented and covered by focused tests. The PostgreSQL
project-memory self-reference migration now registers its ULID primary key
before the foreign key.

- Hong Kong Express is not a clean source publish yet: its fresh frontend build
  has 56 TypeScript errors and the checked-in `public/build` is stale. Laravel
  runtime migration/start preparation is fixed, but that project needs its
  TypeScript build repaired before it is a trustworthy live smoke target.
