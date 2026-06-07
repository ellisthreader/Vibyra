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
Backend stores deployment attempts and exposes `hostingMode`,
`deploymentStatus`, `hostedDemoUrl`/`publicUrl`/`appUrl`, explicit
`frontendStatus`, `backendStatus`, and `backendPlatform`, plus safe
unavailable/building/failed states in community payloads.

Static hosted bundles are the cheap default. Railway-backed demos are for apps
that need server/runtime behavior. Preserve the latest successful hosted/static
demo when a newer deployment fails.

`PublicDemoWebView` is the community/opened-app viewer. It uses sanitized public
demo URLs and must show the clean unavailable panel when a demo is blocked,
missing, building, failed, or not publicly reachable.

## Railway Runtime

`vibyra:deploy-runtime-demos --limit=1` processes queued Railway deployments.
The production Railway service is `Vibyra` at
`https://vibyra-production.up.railway.app`, deployed from
`ellisthreader/Vibeza` branch `codex/vibyra-mobile-auth` with backend root.

Required production variables include `RAILWAY_API_TOKEN`,
`RAILWAY_CLI_PATH`, `RAILWAY_RUNTIME_ENVIRONMENT=production`, and
`RAILWAY_RUNTIME_PROJECT_PREFIX=vibyra-demo`. Set
`RAILWAY_WORKSPACE_ID`/`RAILWAY_TEAM_ID` when the CLI runs non-interactively.

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
