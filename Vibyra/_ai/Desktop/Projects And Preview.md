# Desktop - Projects And Preview

Read this for project discovery, arbitrary folder browse/search, project ids, and desktop preview behavior.

Use `.agents/skills/vibyra-preview-diagnostics/SKILL.md` as the operating
checklist for Preview bugs across Desktop Test, phone WebViews, runtime
startup, target routing, proxy transport, and shutdown.

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

Local element editing contract (implemented 2026-06-11): Desktop Preview
intercepts ordinary right-click inside tracked project iframes, highlights the
DOM element, resolves its owning source with explicit confidence, and opens one
compact AI change composer. Shift+right-click preserves the app/browser context
menu. React/Vue debug source metadata wins; fallback matching uses component,
text, ID, ARIA, and class evidence inside the selected target's app directory.
Ambiguous matches require user choice. The edit reuses the selected project
terminal and existing permission model, while the source badge opens the
existing Editor at the resolved line. Arbitrary custom URLs, public demos, and
top-level phone WebViews do not install the desktop interceptor. Generic
canvas/WebGL selection resolves the canvas and likely owning module, not an
individual scene object without project instrumentation. First files:
`previewInspectorRuntime.mjs`, `previewElementResolver.mjs`,
`app.terminals-test-inspector-data.js`, `app.terminals-test-inspector.js`, and
`app.terminals-test-inspector.css`. The authenticated resolver route is
`POST /desktop/preview/resolve-element`. After upgrading an already-open
Desktop renderer, reload/reopen Desktop and refresh the Preview so both the
new shell asset and newly injected project runtime are active.

Element-edit sending must not wait for source resolution. Exact React/Vue
source metadata is resolved directly before scanning, fallback scans start
inside the selected target app, and a typed instruction remains sendable with
DOM/component context when no confident file match exists. Reused PTY terminal
assignment requests have a 20-second acknowledgement timeout so the inspector
returns to a retryable state instead of remaining on `Sending...`. Preview
implementation prompts may reuse a standalone project terminal or an idle Team
Builder/writer, but never a coordinator, reviewer, verifier, or other read-only
Team role. Failed assignment acknowledgement keeps the inspector draft and
shows the terminal error instead of reporting a successful send.

`preview.mjs` serves static browser entries from `previewResolver.mjs` (`index.html`, `dist/`, `build/`, `out/`, `.output/public/`, app/client/frontend builds, docs/demo/game exports). If none exists, it returns a phone-viewable analyzed-project fallback instead of a blank/no-entry shell.

Preview entry selection prefers built/browser output (`dist/index.html`, `build/index.html`, `out/index.html`, etc.) before root `index.html`, and skips root Vite/source-only entries that reference `/src/main.jsx`, module source entries, or Vite client scripts. When serving nested built entries, absolute `/assets/...` references are rewritten relative to that entry directory so `dist/index.html` loads `dist/assets/...` instead of project-root `assets/...`.

For a project with a recognized runnable profile, a generic root `index.html`
must not win over the runtime. Check a verified matching server first, retain
real built outputs, and return the launch plan instead of serving a stray root
HTML placeholder. Root Expo markers also take precedence over nested Laravel
markers when classifying a monorepo.

For source-only Vite/React projects, `previewDevServer.mjs` may use an already-running dev server only after verifying the selected app's `index.html`, script entry paths, Vite client, and phone-reachable host/port. `projectAppRoots.mjs` supplies the shared common web roots (`.`, `frontend`, `client`, `web`, `app`, `apps/web`, `packages/web`), so selecting a full-stack parent folder can launch the nested browser app. If the user explicitly approves preview startup, authenticated preview start routes can launch recognized package profiles for Expo web, Vite, SvelteKit, Next.js, Astro, Nuxt, Angular, Vue CLI, Create React App, Remix Vite, Parcel, Gatsby, Docusaurus, Ember, Webpack, or Vinxi. `previewFrameworkProfilesExtra.mjs` also permits a simple project-owned `web`, `dev`, `start`, `serve`, or `preview` script after showing the exact npm command; shell-chained, build/test, Electron/Tauri, native-mobile, and other unsafe/non-browser commands remain rejected. Vibyra allocates or discovers a launch port, tracks the child process in `appState.previewServers`, verifies reachable browser HTML plus framework markers where available, and returns that URL. `previewDevServerOutput.mjs` owns dev-server output URL/port parsing and must strip ANSI/color remnants and tolerate spaced URLs such as `http:// localhost:5174/` or network URLs with colored ports; it must not treat plain "port 5173 is already in use" text as a launched server. Preview must not run any project command without visible approval.

`previewRuntimeAdapters.mjs` adds approved browser-runtime launches for Django, FastAPI, Flask, plain PHP, Ruby on Rails, Jekyll, Hugo, and Flutter web, including common nested backend roots. Runtime adapters do not reuse arbitrary services already occupying conventional ports; they verify the process Vibyra started. Native-only Unity/Godot projects still need a web export, and native Electron/Tauri behavior remains outside the iframe even when their browser renderer can be previewed.

Laravel/Vite approved preview startup verifies `artisan`, `composer.json` with `laravel/framework`, and `laravel-vite-plugin`, then runs both `php artisan serve --host 0.0.0.0 --port <free>` and the recognized Vite dev script. The returned preview URL is the Laravel app server, while Vite is verified through `/@vite/client`. Relevant files: `desktop/lib/previewLaravelDevServer.mjs`, `desktop/lib/previewFrameworkProfiles.mjs`.

Preview security phase A uses crypto-random, project-scoped capabilities for new phone preview URLs from `/preview/start`, `/preview/start-server`, and agent apply. Capabilities are passed through static/server/external proxy rewrites, cannot cross projects, and are revoked on preview replacement, approved replacement pairing, phone disconnect, or phone-session expiry. Proxy fallback must reuse the explicit credential from an authenticated preview URL/Referer and must not substitute the global desktop token. Legacy links containing the global `TOKEN` remain migration-compatible by default; set `VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED=false` to retire them independently. Relevant files: `desktop/lib/previewCapabilities.mjs`, `desktop/lib/preview.mjs`, `desktop/lib/pairingHandlers.mjs`, `desktop/lib/agentApply.mjs`, and `desktop/lib/state.mjs`.

For proxied dev-server previews, Vibyra must handle root-absolute runtime app paths without requiring users to edit their apps. `desktop/lib/preview.mjs` rewrites HTML `src`/`href`, inline `style url(...)`, inline module scripts, CSS `url(...)`/`@import`, JS import specifiers, loopback URLs, and common root-absolute asset string literals such as `/AllIn1.glb` or `/Spin.png`. It also exposes a referer-based fallback before phone auth so browser requests like `/AllIn1.glb` or `/projects` that originate from a valid `/preview/server/{projectId}/{TOKEN}/` page are proxied back to the tracked app server instead of returning bridge-root 401s. Proxied Vite `@vite/client` responses guard the HMR websocket connect because the bridge does not proxy WebSocket upgrades; this removes noisy phone preview diagnostics while preserving normal Vite behavior outside Vibyra's proxy.

If a target app or older per-project helper also prefixes assets with `/preview/server/{projectId}/{TOKEN}/`, the bridge unwraps nested duplicate preview prefixes before proxying. Do not fix this recurring `/preview/server/.../preview/server/...` asset 404 by adding project-specific asset files or helper rewrites; keep the idempotency behavior covered in `desktop/lib/preview.test.mjs`.

Laravel/Vite proxying keeps the Laravel app server as the canonical app route and public media origin. Legacy/static `/preview/project/{projectId}/{TOKEN}/...` links fall forward to a tracked `/preview/server/{projectId}/{TOKEN}/...` server when one is running, escaped loopback URLs in inline scripts such as Ziggy's `url` are rewritten onto the Vibyra preview server, Inertia request/response headers are forwarded, and public media requested through the Vite proxy (for example `/videos/logo.mp4`) is fetched from the Laravel app server while Vite module imports stay on the Vite server.

Vite may return its useful transform/import error overlay as an HTML 500 body for a source module such as `/resources/js/app.tsx`. Browsers abort failed module scripts before that HTML can render, so `desktop/lib/preview.mjs` converts Vite source-module 5xx HTML into a 200 JavaScript module that posts a `vibyra-preview-error` diagnostic and renders an in-preview overlay. This keeps bad app code actionable instead of showing a grey phone preview.

Preview repair prompts run a deterministic import-resolution diagnosis before model context ranking. If Vite reports `Failed to resolve import`, `desktop/lib/previewErrorDiagnostics.mjs` and `desktop/lib/previewErrorInspection.mjs` inspect `package.json`, related installed package scopes, and all matching source imports while skipping generated/vendor folders; the resulting context is injected into `desktop/lib/agent.mjs` so the agent fixes the dependency/API mismatch as one class. Mobile `previewFixPrompt.ts` only includes Laravel/Inertia 419 proxy guidance when captured diagnostics actually mention 419/Page Expired/CSRF/XSRF/session evidence.

Proxied HTML also injects a lightweight runtime error overlay before app scripts run. App-code failures such as React `createRoot(...): Target container is not a DOM element` should render on the preview page and post `vibyra-preview-error` diagnostics, so users can hand the visible error back to AI instead of opening browser devtools.

The desktop Test workspace uses the same injected runtime for a compact live
console. Static HTML and tracked dev-server HTML forward
`console.log/info/warn/error/debug` as `vibyra-preview-console` messages, while
runtime and request failures retain `vibyra-preview-error`. The renderer accepts
these messages only from the active preview iframe and retains at most 200
entries. Desktop project runtimes must therefore return through the
project-scoped `/preview/server/{projectId}/{capability}/` proxy instead of a
direct dev-server URL. Arbitrary third-party custom URLs remain viewable but
cannot expose their console because Vibyra does not inject code into them.

Desktop Test device presets live in
`desktop/assets/app.terminals-test-devices.js`. The calibrated mobile/tablet
catalog comes from the standalone PhonePreview project's full-screen CSS
viewports and DPR metadata, then adds common laptop, desktop, QHD, ultrawide,
and 4K sizes. The UI keeps all presets in one grouped selector; selected
curvature and viewport dimensions apply to every preview, while approximate
DPR is forwarded only to Vibyra-injected project previews.

While Test is open, its navigation replaces the terminal tabs in the main
desktop topbar; the canvas has no duplicate internal toolbar. The replacement
shows Terminals at the far left, the device preset and dedicated rotate-device
action centered, and only address/refresh plus Vibyra AI on the right. Preview
mode hides the normal phone/profile actions and has no Live status or project
selector. Zoom out, fit percentage, and zoom in float together at the canvas
bottom-right in one non-wrapping horizontal row. Electron reserves a separate
right-side lane for Vibyra AI and window controls so address/refresh never
overlap them. Back restores the unchanged terminal tabs. Ownership is
`app.terminals-test-view.js`, `app.terminals-test.js`,
`app.terminals-test.css`, `app.terminals-test-responsive.css`, and the
preview-mode shell toggle in `app.shell.js`.

The same injected preview runtime patches `fetch` and `XMLHttpRequest` to surface failed app requests. HTTP failures such as Laravel/Inertia `419 Page Expired` or `401 Unauthorized` render an in-preview request overlay and post a `vibyra-preview-error` diagnostic. Direct proxied HTML error responses with status >= 400 also receive a visible "Preview HTTP error" overlay, so a phone preview should not stay blank or grey when the selected app returns a framework error page. The posted diagnostic stack must sanitize HTML responses by removing Vibyra-injected overlays/scripts/styles and keeping concise app text such as `Page Expired` or `CSRF token mismatch`, otherwise the AI repair prompt receives bridge internals instead of the app error.

Root-absolute runtime assets are proxied only when the request carries a valid project-scoped preview Referer. `servePreviewRefererAsset()` no longer infers authorization from the active selected preview or `latestPreviewCredential`; requests without an authenticated preview Referer continue to normal desktop routing and cannot reach a tracked app server.

Static game exports mounted from entries such as `game/index.html` must resolve root-absolute runtime assets from JS, such as `/models/level.glb`, against the entry mount directory when the browser falls back through a project preview referer. Static preview MIME coverage includes GLB/GLTF, audio, video, fonts, WASM, and manifests. Lua-only folders intentionally return `404 No runnable preview found` instead of a fake browser preview. Regression coverage lives in `desktop/lib/preview.test.mjs`.

Approved startup coverage includes the recognized JavaScript profiles, Laravel+Vite, guarded custom Node web scripts, runtime adapter detection, and an end-to-end Django launch. Keep new launch families covered in `desktop/lib/preview.test.mjs`.

Phone video playback through `/preview/server/{projectId}/{credential}/...` depends on HTTP byte ranges. The proxy forwards `Range`/`If-Range`, preserves `Accept-Ranges`, `Content-Range`, and `Content-Length`, and streams non-rewritten binary responses instead of buffering them. `previewProxyLimits.mjs` defaults to a 15s upstream timeout, 16 concurrent requests, 8 MiB request bodies, and 64 MiB responses; override with `VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS`, `VIBYRA_PREVIEW_PROXY_MAX_CONCURRENCY`, `VIBYRA_PREVIEW_PROXY_MAX_REQUEST_BODY_BYTES`, and `VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES`. Declared oversized responses fail before headers; chunked responses that cross the cap terminate the downstream connection. Regression coverage lives in `desktop/lib/preview.test.mjs`.

Preview app routes under `/preview/server/{projectId}/{TOKEN}/...` proxy all HTTP methods, not just GET. This is required for Laravel/Inertia login and form flows: the bridge forwards request body, cookies, content type, CSRF/XSRF, `X-Inertia`, `X-Inertia-Version`, and `X-Requested-With`, preserves `Set-Cookie`, and rewrites `Location`/`X-Inertia-Location` headers back into the preview server route. Laravel cookies are rewritten for local preview: upstream `Domain`, root `Path`, and `Secure` attributes are removed/replaced with a preview-server path and `SameSite=Lax` so session and `XSRF-TOKEN` cookies are stored by the bridge origin and sent back on preview form posts.

For Laravel/Inertia CSRF compatibility, `proxyRequestHeaders()` also normalizes `X-XSRF-TOKEN`: if the phone WebView/app client does not send the header, the proxy derives it from the forwarded `XSRF-TOKEN` cookie; if it is URL-encoded, the proxy decodes it before forwarding to Laravel. This keeps preview transport from producing false HTTP 419s when the upstream app session cookie is otherwise valid.

Preview proxy form compatibility is broader than direct `/preview/server/...` POSTs. Proxied HTML rewrites form `action`/`formaction`, the injected runtime rewrites same-origin/root-relative `fetch`, `XMLHttpRequest`, and form submits into the tokenized preview path, and trusted preview referer requests can proxy non-GET root app routes before phone auth. `proxyRequestHeaders()` maps preview `Origin`/`Referer` back to the upstream app and sends `X-Forwarded-Host/Proto/Prefix`. Laravel 419 context ranking in `desktop/lib/projectContext.mjs` should put `routes/web.php`, `config/session.php`, middleware, and auth files before unrelated frontend or selected editor files.

Laravel/Vite startup must reject Laravel HTTP error pages during readiness verification instead of reporting a live preview; common root causes include Sail-style `.env` database hosts such as `DB_HOST=mysql` when Vibyra runs bare `php artisan serve` outside the container network.

For any Laravel/Vite folder, `previewLaravelDevServer.mjs` applies a preview-only SQLite fallback when `.env` uses a container MySQL/MariaDB host such as `DB_HOST=mysql` and the project contains `database/database.sqlite`. It does not edit the project; it sets `DB_CONNECTION=sqlite`, `SESSION_DRIVER=file`, `QUEUE_CONNECTION=sync`, and `CACHE_STORE=file` only for the spawned PHP preview process. `previewLaravelDiagnostics.mjs` also classifies common Laravel 500 logs for live-chat errors, including container DB host failures, missing Vite manifests, missing session tables, and Composer/PHP runtime mismatches such as `ReflectionProperty::isVirtual()`.

Laravel/Vite startup also treats `public/hot` as generated state: it removes a stale hot file before launch when the project is writable, fails immediately with an ownership repair command on `EACCES`, and does not recommend running Vite as root. Readiness stops when PHP or Vite exits instead of waiting for the full timeout. A Vite bind race gets one retry on a newly selected port, PHP/Vite allocations avoid choosing the same port, and the tracked Vite proxy uses the actual verified fallback port rather than the originally requested port.

Preview startup must not silently run framework dev servers. Expo web is a
recognized allowlisted profile: `previewExpo.mjs` accepts simple Expo scripts,
checks common Metro ports, matches the served title to the selected project,
and verifies `AppEntry.bundle` is JavaScript. The desktop Test flow presents
the exact detected command for approval and then uses the project-scoped
preview proxy for the verified runtime. While project inspection or approved startup is in progress, the
selected Test device stays visible and renders terminal-style staged activity
inside the frame; launch errors remain in that frame with a retry action.

Desktop Preview target discovery is bounded to four directory levels and skips
generated/private folders. `projectAppDiscovery.mjs` and `previewTargets.mjs`
enumerate recognized nested package apps and runtime adapters, including
multiple web apps, Expo/mobile targets, desktop targets, and Python/PHP/Ruby/
Flutter runtimes. Unsupported native-only Electron, Tauri, and React Native
targets remain visible but cannot be run. Inspection never starts a process;
the right-workspace UI requires an explicit in-panel Run action, submits the
detected target ID, and `desktopPreview.mjs` re-detects it before
`previewDevServer.mjs` starts the selected app directory.

Preview auto-detection is initialized by the right-workspace Preview tab
itself. `app.terminals-test.js` synchronizes `terminalTestProjectId` on panel
open, active-terminal changes, and `vibyra:terminal-companion-context`; it then
calls read-only `/desktop/preview`. `app.terminals-test-state.js` resolves the
project from the active terminal first, then the active project group, setup
selection, current desktop project, and persisted selected project while
excluding `full-pc` and unassigned pseudo-projects.

Desktop Preview start, activate, and stop responses are request-, project-, and
target-scoped in `app.terminals-test-launch.js`. If the user changes project,
target, or loads a custom URL while an async action is pending, the stale
result must not overwrite the new frame or status.

Approved startup has a real device-frame feed. `previewStartupFeed.mjs` keeps a
bounded transient command/stdout/stderr transcript, exposed only through the
desktop-authenticated
`GET /desktop/preview/startup?projectId=...&targetId=...` route.
`previewDevServer.mjs` and `previewLaravelDevServer.mjs` append actual child
process output. `app.terminals-test-feed.js` polls while the approved POST is
pending, and `app.terminals-test-loading.js` renders that transcript inside the
selected device until the verified app URL replaces it. Auto-detection remains
read-only and never begins this feed or starts a process.

Desktop target runtimes are concurrent per project. `appState.previewServices`
tracks services by `projectId + targetId`, while `appState.previewServers[projectId]`
remains the active visual proxy alias for compatibility. Desktop start re-detects
the requested target, starts or reuses only that service, and activates it;
`POST /desktop/preview/activate` switches the alias without executing a command,
`POST /desktop/preview/stop-server` stops only that target, and startup feeds use
both `projectId` and `targetId`. Desktop visual capabilities may pin `targetId`
so an existing iframe remains attached to its original service after activation
changes. Project-scoped `/preview/proxy-url` authorization still recognizes every
tracked service for that project, including background backends, but rejects
untracked local ports. First files: `desktopPreview.mjs`, `previewServices.mjs`,
`previewServerProcesses.mjs`, `previewCapabilities.mjs`, and
`previewProxyReferences.mjs`.

The detected-app picker uses neutral cards and reserves its restrained purple
border/tint for the selected app. Primary Run button styles must stay scoped
away from target cards so every detected app does not appear to be an action.

Desktop Preview can keep multiple detected targets running at once, such as a
backend plus Expo/web frontend, while showing one selected device frame.
`previewServices.mjs` owns target-scoped services; `previewServers[projectId]`
remains the active visual alias for compatibility. The picker exposes compact
Starting/Running state and one contextual Run/View/Stop action. Each start is
still explicitly approved and revalidated. Target-pinned capabilities keep an
existing frame attached to its service, while `/preview/proxy-url` permits only
other tracked services in the same project for frontend-to-backend loopback
calls.

Phone and Desktop Test preview starts converge on the same detected target IDs. `previewServerProcesses.mjs` owns target-scoped start generations: duplicate starts share one promise, Stop invalidates the old generation and permits an immediate replacement, and an older readiness/exit cannot claim or remove that replacement. `previewPortAllocator.mjs` keeps short-lived in-process reservations through spawn/readiness so concurrent targets and Laravel's PHP/Vite pair cannot select the same candidate port. Concurrent phone preview requests use newest-request-only capability commits, so a returned preview URL is not immediately revoked by an older request finishing later.

Preview process ownership ends with the desktop bridge. `previewShutdown.mjs` stops tracked preview process groups on `SIGINT`, `SIGTERM`, fatal errors, and independent server close; `/desktop/quit` performs the same cleanup. Electron real application quit posts to loopback `/desktop/quit` with a bounded timeout before exiting, while normal titlebar close still hides the window. Cleanup is limited to recorded children and must not kill unrelated services by port or executable name.

Shutdown remains fail-safe if child cleanup itself throws:
`previewShutdown.mjs` logs the cleanup error but still closes the bridge and
exits. `resolvedPreviewUrl()` must import `startProjectDevServer`; otherwise
opening an already-running phone preview fails with a runtime `ReferenceError`.

Preview viewport preferences are renderer-local and keyed by
`projectId + targetId` in `app.terminals-test-viewports.js`. Each target restores
its own device preset, orientation, zoom, and custom dimensions before
activation; new targets receive the automatic framework recommendation once.
The bounded local store keeps the most recent 80 target viewport states.

Expo detection runs before generic project-script detection. Repos may have
`start: npm run dev` wrappers that start Laravel plus Expo; Desktop Test instead
launches the dedicated Expo web script with `--host lan --port <free>`. This
avoids backend `8000` conflicts and Expo's non-interactive port prompt.
Framework script detection also accepts aliases such as `web:dev` and
`dev:web`; app-root discovery includes `website`, `site`, `ui`, `dashboard`,
`apps/client`, and `packages/app`.

When no runtime is launchable, `previewDetection.mjs` returns a concrete reason
such as package-only, unrecognized scripts, or a non-web Python/CLI project.
Desktop Test shows that reason and hides the start action rather than offering
a command that cannot succeed.

Desktop preview regression coverage lives in `desktop/lib/preview.test.mjs` and runs with `npm run test:desktop-preview`. Keep Node `desktop/lib/preview.mjs` and Laravel `backend/app/Services/Concerns/ProjectPreview.php` aligned: nested build entries mount their entry directory as the static root, while root `index.html` keeps absolute assets at the project root. Preview serving also rewrites root-absolute CSS `url(...)` and `@import` paths into the same mount root, skips source-only `/src/...` module entries in every candidate root, supports common static asset MIME types (`wasm`, `ico`, `avif`, `webmanifest`, maps), and must reject empty project paths or traversal.

Authenticated `GET /files/publish-demo-bundle?projectId=...` is the desktop-only source for static hosted-demo publishing and is separate from `/files/review-bundle`. It uses preview static entry resolution, bundles the entry plus referenced HTML/CSS/JS/static assets through `desktop/lib/publishDemoBundle.mjs` and `publishDemoBundleRefs.mjs`, excludes unsafe/private/generated folders and env/credential files, enforces file-count/byte caps, and returns `ok: false` with code/reason/metadata when no static entry or caps prevent a usable bundle. If no built static entry exists but the project has a `package.json` `build` script, publish-demo bundling can install missing Node dependencies once with lifecycle scripts disabled (`--ignore-scripts`), then runs the build with bounded timeouts and retries static capture; this fixes the common case where local dev preview works but `node_modules`/`dist/` is missing. Regression coverage lives in `desktop/lib/publishDemoBundle.test.mjs`.

For Laravel/Inertia projects with `laravel/framework`, `laravel-vite-plugin`, and `public/build/manifest.json`, publish-demo bundling can create a generated static `index.html` shell from the Vite manifest and include web-root-relative `build/...` plus public runtime assets such as `images/` and `videos/`. This is intentionally metadata-tagged as `laravel-vite-static-shell`: it can show a real compiled public frontend shell when safe, but routes, auth, database, forms, orders, and API responses still require the approved Laravel runtime path or per-project cloud hosting. Relevant files: `desktop/lib/publishDemoBundle.mjs`, `desktop/lib/publishDemoBundleLaravel.mjs`, and `desktop/lib/publishDemoBundle.test.mjs`.

If a project shows `Hosted demo` but the app panel says live data is unavailable, first test the desktop route directly with the selected project id. If `/files/publish-demo-bundle` returns `ok: true` but `published_project_deployments` has only generated `demo_html` and no `demo_files`/`entry_path`, the project was published with the source-preview fallback and must be updated/republished so the backend stores the static bundle.

Authenticated `GET /files/publish-runtime-bundle?projectId=...` prepares the runtime source bundle for backend-needed public demos. It searches the selected root plus common backend/app roots from `projectAppRoots.mjs`, rebases the chosen runtime root into the deployment bundle, and supports Node, Laravel, and conventional Python Django/FastAPI/Flask projects. It includes safe source/package files, excludes generated/private/env/credential paths, and returns `ok: false` for frontend-only or unrecognized runtime packages. Mobile sends this as `runtimeBundle` during publish; backend queues it for Railway runtime deployment. Regression coverage lives in `desktop/lib/publishRuntimeBundle.test.mjs`.

When public publishing says Vibyra could not capture a public app preview, distinguish it from live desktop preview. Public publish needs one backend-openable payload: real sanitized `previewHtml`, an `ok: true` `/files/publish-demo-bundle`, or an `ok: true` `/files/publish-runtime-bundle`. Source-code listing fallback HTML is rejected by backend. Diagnose by calling both desktop bundle routes for the selected project id; common real causes are source-only folders with no built static entry/build script, package-only Vibyra workspaces, unsupported non-Node runtimes, bundle caps, or unsafe/private referenced files. Mobile should surface the desktop bundle/runtime `reason` before the backend's generic public-preview gate.

Publish identity contract (2026-06-09): mobile uses the desktop source project ID for selection, review, static/runtime bundle requests, and backend `sourceProjectId`, and forwards the matching absolute `projectPath` as a validated stale-ID fallback. Desktop project resolution accepts that fallback only for a real recognized project directory. Runtime bundles stop at private directories including `.env`, `secrets/`, `credentials/`, `private/`, and `.ssh/`. Regression coverage is in `desktop/lib/publishContractMatrix.test.mjs`, `desktop/lib/publishIntegration.test.mjs`, and `src/screens/workspace/inline/ProjectPublishContractMatrix.test.mjs`.

`/files/review-bundle` is submitted to backend safety review and must exclude
`.env`, private keys, certificates, and credential-like paths even though those
files can remain available to local project browsing. Run
`node --test desktop/lib/publishIntegration.test.mjs` for a no-provider
end-to-end check: it starts an isolated bridge, browses a full-stack fixture,
captures review/static/runtime bundles, submits the runtime payload to Laravel's
in-memory test environment, verifies frontend/backend statuses and precise
failure messages, and checks `/home/ellis/Desktop/ReactLaravel` read-only when
that folder exists.
