# Desktop - Projects And Preview

Read this for project discovery, arbitrary folder browse/search, project ids, and desktop preview behavior.

## Files

- `desktop/lib/projects.mjs`
- `desktop/lib/projectInfo.mjs`
- `desktop/lib/projectAnalysis.mjs`
- `desktop/lib/projectAnalysisMetadata.mjs`
- `desktop/lib/projectBrowse.mjs`
- `desktop/lib/projectCreate.mjs`
- `desktop/lib/preview.mjs`
- `desktop/lib/previewDevServer.mjs`
- `desktop/lib/previewResolver.mjs`

## Discovery And Analysis

`desktop/lib/projects.mjs` scans cwd and common user folders. It recognizes projects by markers such as `package.json`, `.git`, `app.json`, `requirements.txt`, and `pyproject.toml`.

`projectInfo.mjs` is the source of project metadata sent to mobile. `projectAnalysis.mjs` is deterministic and capped; it shallow-scans folders, prioritizes root marker files, skips generated folders, samples small text/config files, and infers framework/purpose. It does not use AI. README/package/HTML descriptions are authoritative for the displayed summary before inferred "looks like" labels. `projectAnalysisMetadata.mjs` filters templated/default titles such as Blade `config('app.name')`, and `projectAnalysisPurpose.mjs` caps repeated hits, weighs descriptions strongly, recognizes portfolio sections, and requires real food/venue evidence before using the restaurant category. Analysis responses include `analysis.analyzerVersion`; mobile treats older cached setup-card/project analysis as stale and re-runs `/desktop/analyze`. Regression coverage lives in `desktop/lib/projectAnalysis.test.mjs`.

`GET /desktop/analyze?path=...` returns an analyzed project after the phone selects a folder. Browse PC child rows stay cheap. Desktop still returns `briefRequired: true`; mobile requires user confirmation before saving detected briefs.

## Browse And Search

Manual folder selection uses authenticated `GET /desktop/browse?path=...`, backed by `projectBrowse.mjs`. With no path, it returns common roots. With a path, it returns current folder, parent path, and visible child files/folders; browsed folders are cached as projects.

`/desktop/browse` normalizes an existing file path back to its containing folder before listing. This prevents file-scoped mobile chat context from making Browse PC treat a selected file as the folder root.

Root listing must normalize candidates with `candidates.map((path) => resolve(path))`, not `candidates.map(resolve)`, because `Array.map` passes extra args that make `node:path.resolve` throw.

Authenticated `GET /desktop/search?q=...` finds arbitrary folders as well as marker-based projects. It ranks cached/discovered projects, then shallow-scans common folders for matching directory names and caches matches so `/files?projectId=...` can open them.

Folder search ranking uses `desktop/lib/searchScoring.mjs` for normalized token and edit-distance matches, including adjacent transpositions. Keep typo-tolerant project/folder matching there and cover it with `desktop/lib/searchScoring.test.mjs`.

Authenticated `GET /desktop/context?projectId=...&q=...` returns VS Code-style prompt context for AI chat. `desktop/lib/projectContext.mjs` scans readable text files under the selected project, skips generated/vendor folders, ranks files by prompt intent and filename/path matches, and returns up to 100 file entries with snippets for the top matches. UI/style prompts strongly prefer frontend roots such as `src/`, `components/`, `screens/`, `styles/`, `frontend/`, `client/`, `web/`, and Laravel `resources/css|js|views`, while backend-only paths are penalized. Mobile uses this before `/api/chat` so questions like colour scheme can pull frontend/theme files even when the loaded mobile file list is backend-only.

## Project IDs

`projectById` never falls back to the first discovered project. It checks `appState.cachedProjects`, then decodes Vibyra base64url path ids for browsed/searched folders.

Desktop `/agents/start` accepts `projectPath` alongside `projectId`; Node and Laravel paths use it as a trusted-home fallback when a newly opened arbitrary folder is not in cached discovery state.

## Preview

`preview.mjs` serves static browser entries from `previewResolver.mjs` (`index.html`, `dist/`, `build/`, `out/`, `.output/public/`, app/client/frontend builds, docs/demo/game exports). If none exists, it returns a phone-viewable analyzed-project fallback instead of a blank/no-entry shell.

Preview entry selection prefers built/browser output (`dist/index.html`, `build/index.html`, `out/index.html`, etc.) before root `index.html`, and skips root Vite/source-only entries that reference `/src/main.jsx`, module source entries, or Vite client scripts. When serving nested built entries, absolute `/assets/...` references are rewritten relative to that entry directory so `dist/index.html` loads `dist/assets/...` instead of project-root `assets/...`.

For source-only Vite/React projects, `previewDevServer.mjs` may use an already-running dev server only after verifying the selected project's root `index.html`, script entry paths, Vite client, and phone-reachable host/port. If the phone user explicitly approves preview startup, authenticated `POST /preview/start-server` can start from package.json evidence alone through `previewFrameworkProfiles.mjs`: the selected project must expose a simple recognized script with matching dependency evidence for Vite, SvelteKit, Next.js, Astro, Nuxt, Angular, Vue CLI, Create React App, or Remix Vite. Vibyra allocates a free launch port with `previewPortAllocator.mjs`, starts the script with the profile's fixed host/port args or `PORT` env, tracks the child process in `appState.previewServers`, parses launched server URLs from output as fallback, verifies reachable HTML plus profile markers or Vite client where appropriate, and returns that URL. `previewDevServerOutput.mjs` owns dev-server output URL/port parsing and must strip ANSI/color remnants and tolerate spaced URLs such as `http:// localhost:5174/` or network URLs with colored ports; it must not treat plain "port 5173 is already in use" text as a launched server. Preview must not silently run arbitrary `npm run dev`, `npm run build`, shell-chained scripts, or wrapper commands; without approval or a verified server, the analyzed-project fallback remains the response.

Laravel/Vite approved preview startup verifies `artisan`, `composer.json` with `laravel/framework`, and `laravel-vite-plugin`, then runs both `php artisan serve --host 0.0.0.0 --port <free>` and the recognized Vite dev script. The returned preview URL is the Laravel app server, while Vite is verified through `/@vite/client`. Relevant files: `desktop/lib/previewLaravelDevServer.mjs`, `desktop/lib/previewFrameworkProfiles.mjs`.

Approved dev-server previews return to mobile as tokenized desktop proxy URLs (`/preview/server/{projectId}/{TOKEN}/`, with `/preview/proxy-url/{TOKEN}` for loopback or absolute asset references) while `appState.previewServers` stores the real loopback target and tracked child processes. Relevant files: `desktop/lib/preview.mjs`, `desktop/lib/previewDevServer.mjs`, `desktop/lib/previewLaravelDevServer.mjs`, `desktop/lib/previewServerProcesses.mjs`.

For proxied dev-server previews, Vibyra must handle root-absolute runtime app paths without requiring users to edit their apps. `desktop/lib/preview.mjs` rewrites HTML `src`/`href`, inline `style url(...)`, inline module scripts, CSS `url(...)`/`@import`, JS import specifiers, loopback URLs, and common root-absolute asset string literals such as `/AllIn1.glb` or `/Spin.png`. It also exposes a referer-based fallback before phone auth so browser requests like `/AllIn1.glb` or `/projects` that originate from a valid `/preview/server/{projectId}/{TOKEN}/` page are proxied back to the tracked app server instead of returning bridge-root 401s. Proxied Vite `@vite/client` responses guard the HMR websocket connect because the bridge does not proxy WebSocket upgrades; this removes noisy phone preview diagnostics while preserving normal Vite behavior outside Vibyra's proxy.

If a target app or older per-project helper also prefixes assets with `/preview/server/{projectId}/{TOKEN}/`, the bridge unwraps nested duplicate preview prefixes before proxying. Do not fix this recurring `/preview/server/.../preview/server/...` asset 404 by adding project-specific asset files or helper rewrites; keep the idempotency behavior covered in `desktop/lib/preview.test.mjs`.

Laravel/Vite proxying keeps the Laravel app server as the canonical app route and public media origin. Legacy/static `/preview/project/{projectId}/{TOKEN}/...` links fall forward to a tracked `/preview/server/{projectId}/{TOKEN}/...` server when one is running, escaped loopback URLs in inline scripts such as Ziggy's `url` are rewritten onto the Vibyra preview server, Inertia request/response headers are forwarded, and public media requested through the Vite proxy (for example `/videos/logo.mp4`) is fetched from the Laravel app server while Vite module imports stay on the Vite server.

Vite may return its useful transform/import error overlay as an HTML 500 body for a source module such as `/resources/js/app.tsx`. Browsers abort failed module scripts before that HTML can render, so `desktop/lib/preview.mjs` converts Vite source-module 5xx HTML into a 200 JavaScript module that posts a `vibyra-preview-error` diagnostic and renders an in-preview overlay. This keeps bad app code actionable instead of showing a grey phone preview.

Preview repair prompts run a deterministic import-resolution diagnosis before model context ranking. If Vite reports `Failed to resolve import`, `desktop/lib/previewErrorDiagnostics.mjs` and `desktop/lib/previewErrorInspection.mjs` inspect `package.json`, related installed package scopes, and all matching source imports while skipping generated/vendor folders; the resulting context is injected into `desktop/lib/agent.mjs` so the agent fixes the dependency/API mismatch as one class. Mobile `previewFixPrompt.ts` only includes Laravel/Inertia 419 proxy guidance when captured diagnostics actually mention 419/Page Expired/CSRF/XSRF/session evidence.

Proxied HTML also injects a lightweight runtime error overlay before app scripts run. App-code failures such as React `createRoot(...): Target container is not a DOM element` should render on the preview page and post `vibyra-preview-error` diagnostics, so users can hand the visible error back to AI instead of opening browser devtools.

The same injected preview runtime patches `fetch` and `XMLHttpRequest` to surface failed app requests. HTTP failures such as Laravel/Inertia `419 Page Expired` or `401 Unauthorized` render an in-preview request overlay and post a `vibyra-preview-error` diagnostic. Direct proxied HTML error responses with status >= 400 also receive a visible "Preview HTTP error" overlay, so a phone preview should not stay blank or grey when the selected app returns a framework error page. The posted diagnostic stack must sanitize HTML responses by removing Vibyra-injected overlays/scripts/styles and keeping concise app text such as `Page Expired` or `CSRF token mismatch`, otherwise the AI repair prompt receives bridge internals instead of the app error.

Root-absolute runtime assets may arrive without a `/preview/...` referer after Vite/Laravel dynamic imports or public media loads. `servePreviewRefererAsset()` uses the active selected preview server as a restricted fallback for asset-like paths such as `/build/assets/*.js`, `/images/*`, `/assets/*`, media, fonts, maps, and web manifests, while still refusing non-asset desktop/app routes without a trusted preview referer.

Static game exports mounted from entries such as `game/index.html` must resolve root-absolute runtime assets from JS, such as `/models/level.glb`, against the entry mount directory when the browser falls back through a project preview referer. Static preview MIME coverage includes GLB/GLTF, audio, video, fonts, WASM, and manifests. Lua-only folders intentionally return `404 No runnable preview found` instead of a fake browser preview. Regression coverage lives in `desktop/lib/preview.test.mjs`.

Approved dev-server startup is covered for Vite, Next.js, SvelteKit, Astro, Nuxt, Angular, Vue CLI, Create React App, Remix Vite, and Laravel+Vite; keep new framework profiles covered in `desktop/lib/preview.test.mjs` before trusting them from mobile.

Phone video playback through `/preview/server/{projectId}/{TOKEN}/...` depends on HTTP byte ranges. `desktop/lib/preview.mjs` forwards `Range`/`If-Range` and preserves media headers such as `Accept-Ranges`, `Content-Range`, and `Content-Length` for non-rewritten binary responses; regression coverage lives in `desktop/lib/preview.test.mjs`.

Preview app routes under `/preview/server/{projectId}/{TOKEN}/...` proxy all HTTP methods, not just GET. This is required for Laravel/Inertia login and form flows: the bridge forwards request body, cookies, content type, CSRF/XSRF, `X-Inertia`, `X-Inertia-Version`, and `X-Requested-With`, preserves `Set-Cookie`, and rewrites `Location`/`X-Inertia-Location` headers back into the preview server route. Laravel cookies are rewritten for local preview: upstream `Domain`, root `Path`, and `Secure` attributes are removed/replaced with a preview-server path and `SameSite=Lax` so session and `XSRF-TOKEN` cookies are stored by the bridge origin and sent back on preview form posts.

For Laravel/Inertia CSRF compatibility, `proxyRequestHeaders()` also normalizes `X-XSRF-TOKEN`: if the phone WebView/app client does not send the header, the proxy derives it from the forwarded `XSRF-TOKEN` cookie; if it is URL-encoded, the proxy decodes it before forwarding to Laravel. This keeps preview transport from producing false HTTP 419s when the upstream app session cookie is otherwise valid.

Preview proxy form compatibility is broader than direct `/preview/server/...` POSTs. Proxied HTML rewrites form `action`/`formaction`, the injected runtime rewrites same-origin/root-relative `fetch`, `XMLHttpRequest`, and form submits into the tokenized preview path, and trusted preview referer requests can proxy non-GET root app routes before phone auth. `proxyRequestHeaders()` maps preview `Origin`/`Referer` back to the upstream app and sends `X-Forwarded-Host/Proto/Prefix`. Laravel 419 context ranking in `desktop/lib/projectContext.mjs` should put `routes/web.php`, `config/session.php`, middleware, and auth files before unrelated frontend or selected editor files.

Laravel/Vite startup must reject Laravel HTTP error pages during readiness verification instead of reporting a live preview; common root causes include Sail-style `.env` database hosts such as `DB_HOST=mysql` when Vibyra runs bare `php artisan serve` outside the container network.

For any Laravel/Vite folder, `previewLaravelDevServer.mjs` applies a preview-only SQLite fallback when `.env` uses a container MySQL/MariaDB host such as `DB_HOST=mysql` and the project contains `database/database.sqlite`. It does not edit the project; it sets `DB_CONNECTION=sqlite`, `SESSION_DRIVER=file`, `QUEUE_CONNECTION=sync`, and `CACHE_STORE=file` only for the spawned PHP preview process. `previewLaravelDiagnostics.mjs` also classifies common Laravel 500 logs for live-chat errors, including container DB host failures, missing Vite manifests, missing session tables, and Composer/PHP runtime mismatches such as `ReflectionProperty::isVirtual()`.

Preview startup must not silently run framework dev servers. Dynamic stacks such as Laravel, Django, Expo, Flutter, Unity, and Godot show typed readiness guidance until a real browser entry or approved runtime exists.

Desktop preview regression coverage lives in `desktop/lib/preview.test.mjs` and runs with `npm run test:desktop-preview`. Keep Node `desktop/lib/preview.mjs` and Laravel `backend/app/Services/Concerns/ProjectPreview.php` aligned: nested build entries mount their entry directory as the static root, while root `index.html` keeps absolute assets at the project root. Preview serving also rewrites root-absolute CSS `url(...)` and `@import` paths into the same mount root, skips source-only `/src/...` module entries in every candidate root, supports common static asset MIME types (`wasm`, `ico`, `avif`, `webmanifest`, maps), and must reject empty project paths or traversal.
