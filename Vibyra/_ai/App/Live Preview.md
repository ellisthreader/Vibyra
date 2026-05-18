# App - Live Preview

Read this for in-app website/app previews, preview cards in chat, blank preview bugs, and "open/view on my phone" prompts.

## Main Files

- `src/context/useAgentActions.ts`
- `src/context/useWorkspaceActions.ts`
- `src/screens/workspace/hooks/useWorkspaceActions.ts`
- `src/screens/workspace/helpers/chatReplies.ts`
- `src/screens/workspace/inline/chatPreviewFallback.ts`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/components/AppWebView.tsx`
- `src/components/AppWebView.native.tsx`
- `src/components/AppWebView.web.tsx`
- `backend/app/Services/Concerns/OpenAiStreaming.php`
- `src/types/domain.ts`

## Preview Model

`ChatMessage.app` carries preview cards for both cloud-generated inline HTML and desktop-served project previews. `GeneratedApp` can carry either `html` or `url`.

`AppPreviewModal` renders through `AppWebView`, preferring inline `html` and using `url` as fallback. Desktop agent completions attach generated `index.html` from `result.files` when available, so fresh builds do not depend on the LAN preview route.

On web, inline previews render in `AppWebView.web.tsx` via `iframe srcDoc`. The base `AppWebView.tsx` is also browser-safe and must not import `react-native-webview`; native WebView code belongs in `AppWebView.native.tsx` only, so Expo web cannot bundle the unsupported native module. The sandbox must include `allow-same-origin` along with `allow-scripts`; generated apps are allowed to use `localStorage`, and without same-origin the browser throws `SecurityError: Failed to read the 'localStorage' property from 'Window'`.

`chatPreviewFallback.ts` strips imports/requires from fenced React snippets and provides browser shims for common React Native primitives, including `WebView`, so AI-generated mobile-flavored previews open as iframe-safe browser code instead of crashing with `react-native-webview does not support this platform`. Backend prompt guidance in `backend/app/Services/Concerns/OpenAiStreaming.php` tells models that phone previews run in a browser iframe and must use browser HTML/CSS/JavaScript rather than React Native/Expo native modules.

Preview runtime diagnostics are user-facing. `AppWebView.tsx` and `AppWebView.web.tsx` use `appWebViewPreview.ts` to inject/capture `window.error`, `unhandledrejection`, relevant `console.error`/`console.warn` calls, capture-phase resource load failures from preview-owned elements (`img`, `script`, `link`, media, etc.), and loader failures from `Image`, `document.createElement`, `fetch`, and `XMLHttpRequest`. These forward `PreviewRuntimeError` items to `AppPreviewModal`, so framework asset 404s such as Phaser sprite loads appear in the yellow preview diagnostics instead of only the browser console. The preview bridge also patches Phaser `load.image(...)` calls for local/bare or known hallucinated Vibyra CDN asset URLs to use blob SVG placeholders instead of unsupported `data:` URLs. `appWebViewFrameworkScripts.ts` normalizes known generated framework CDN scripts such as Three.js/Phaser/React to guarded loaders, and `appWebViewFrameworkFallbacks.ts` supplies a lightweight lazy Three.js canvas fallback so failed CDN scripts do not immediately crash with `THREE is not defined`. The modal keeps the recent unique diagnostics for the open preview session. `PreviewErrorPanel` shows a compact optional overlay by default, can expand into a scrollable diagnostic history, and has an **Ask AI to fix** button that closes the preview and pre-fills the chat composer with all captured messages, source/line/column, stacks, and the current preview HTML excerpt when available. Keep this path available on phone because users cannot inspect a console there.

Babel standalone's "in-browser Babel transformer" production warning is benign for legacy/generated self-contained previews that use `type="text/babel"`. `appWebViewPreviewErrors.ts` filters it out so a working preview does not show a crash panel or push the user into an unnecessary fix/edit flow.

Generated preview prompts must also prevent the problem at source. `backend/app/Http/Controllers/Concerns/ChatPrompting.php` and `backend/app/Services/Concerns/OpenAiStreaming.php` tell models not to invent image asset URLs or Vibyra asset CDN paths, and to use canvas, inline SVG, CSS shapes/gradients, emoji/icons, or verified/generated inline assets instead. New standalone builds should not rely on external script CDNs, ESM imports, or CDN framework globals for core behavior; games/3D should prefer inline browser-native canvas/WebGL/CSS/SVG. Phaser prompts should prefer generated textures over `this.load.image(...)` with fake, local, or unverified sprite URLs.

User-facing preview guidance must assume the user is in the phone app. `ChatPrompting.php`, `OpenAiStreaming.php`, and `ChatReplyGuard.php` tell/force preview replies toward the in-app Live Preview card instead of `localhost`/`127.0.0.1`; explicit backend/dev setup prompts may still mention local URLs.

`chatPreviewFallback.ts` wraps fenced React snippets in a browser runnable shell. It supplies lightweight router shims (`BrowserRouter`, `HashRouter`, `Routes`, `Route`, `Link`, etc.) because AI often emits React Router components without importing `react-router-dom`; without the shims the preview crashes with `ReferenceError: BrowserRouter is not defined`.

## Open Behavior

The chat path should not auto-open the preview modal. It should add a tappable preview card, and the modal opens only when the user taps the card.

Desktop agent code-change replies attach a Live Preview card only after changes are applied and the changed files look browser-previewable, or when the result includes a generated `index.html`. Pending edits and generic backend/config/test code changes keep the code changes card without preview UI. Relevant files: `src/context/agentPreviewHelpers.ts`, `src/context/useAgentResultHandlers.ts`, `src/context/useEditPermissionActions.ts`.

Explicit preview/open-on-phone intents add the preview card to the assistant reply. Preview trouble prompts like "why is it blank" are handled locally and re-offer the preview card instead of sending a `.vibyra-agent/runs/*.md` question to the agent.

Preview intent handling uses `runtime.runnablePreviewApp()` to resolve the active preview and passes it to `addLocalChatReply`, so prompts like "run this code" produce a tappable Live Preview card in chat instead of text-only "tap the card" guidance. The resolver checks existing `ChatMessage.app`, fenced code via `chatPreviewFallback.ts`, loaded project files, and verified desktop preview URLs.

The `/preview` command is the canonical project-scoped command; `/test` is an alias. `workspaceChatRuntime.openRunnablePreview()` must look only at the active visible/project thread before falling back to that project's files or a verified desktop preview URL; do not scan all `chatThreads` or reuse the previous global `previewApp`, or an old preview from another project can open. `workspacePreviewProbe.ts` fetches the desktop preview URL first, follows the resolved URL for asset checks, and still refuses old analyzed-project fallback pages from older desktop builds. Current desktop/backend preview services must never generate "Project analyzed": they return a real static/browser entry, redirect to a verified running dev server, or report no runnable preview.

Opening a file from chat is not a preview action. `workspacePromptActions.runFileOpen()` clears `previewApp` before `app.selectFile(file.id)` so an already-open project preview WebView cannot remain visible and show a stale desktop fallback while the user is trying to inspect source.

## Intent Routing

`isViewPreviewIntent` in `chatReplies.ts` matches preview/open/view/run wording around website/site/page/app/preview/index.html/html/build plus phrases like "open it on my phone" and bare `preview`.

In project chat, preview intent routes through `handleWorkspacePreviewIntent()` before `app.startAgent`. It calls `openRunnablePreview()` so explicit preview/open-on-phone prompts use the same modal path as `/preview` and Live Preview card taps. If no runnable preview exists, it reports that instead of attaching the desktop analyzed-project fallback. Natural-language terminal parsing must not intercept phone/browser preview phrasing such as "run the build on my phone"; those prompts stay on the preview path. In detached chat, preview intent should run before folder/file lookup and use `previewNeedsProjectReply()`.

This branch must run before `app.startAgent`; otherwise prompts such as "open the app on my phone" can be mis-treated as code edits.

When project chat preview intent finds no runnable preview but has a desktop connection, `workspacePreviewActions.ts` creates a structured `ChatMessage.previewServer` approval card instead of plain assistant text. `workspacePromptActions.ts` keeps a pending preview-server approval separate from generic terminal approvals; on yes/button approval it updates that same card through real phases from `app.startPreviewServer()` (`requesting-desktop`, `starting-server`, `verifying-phone`, then `ready`/`failed`) and attaches the returned verified URL as a Live Preview card. On no it marks the same card cancelled without running a desktop command.

If `/preview/start-server` returns `Unknown Vibyra Desktop route`, the phone is talking to an older running desktop bridge. `useWorkspaceActions.startPreviewServer()` should surface that as a restart/reconnect Vibyra Desktop message, not as a project directory or folder-location issue.

Preview crash-fix prompts generated by `previewFixPrompt.ts` are an exception: `workspacePromptActions.isPreviewFixPrompt()` must route them to `app.startAgent` before `handleWorkspacePreviewIntent()`, or the crash text is misclassified as a preview-open request and reopens the modal instead of fixing code. `GeneratedApp.source` separates generated inline previews from real desktop project previews. Generated/html previews may ask for a corrected self-contained `<vibyra-app>`; desktop/project previews must ask the agent to fix existing project files and must explicitly forbid unrelated root `index.html`, detached static pages, or self-contained `<vibyra-app>` replacements. `useAgentActions.shouldUseBuildChatMode()` must not force these desktop project crash prompts into cloud build mode when no desktop connection exists.

Crash-fix and preview-edit prompts must force build mode in `useAgentActions.shouldUseBuildChatMode()` and `startAgent()` returns a boolean so `AppPreviewModal` only shows done after a run actually starts/completes. `AppPreviewModal` clears diagnostics on reload and on app content fingerprint changes, not just `app.id`.

## Project Preview Guard

`openProjectPreview` checks whether the project id exists in `app.projects` before opening the in-app desktop preview. Unknown restored/adopted projects fall back to opening chat directly to avoid stale desktop `/preview/project/{id}/{token}/` 404 shells.

Opening or accepting an analyzed desktop folder should not create a fake desktop preview. The desktop preview route serves only a real static browser entry or a verified dev-server redirect; without one it returns `404 No runnable preview found`, and desktop/backend agent preview payloads should leave `url` null so the app does not attach a fake Live Preview card. Relevant files: `src/screens/workspace/hooks/workspaceFolderActions.ts`, `src/screens/workspace/hooks/workspaceChatRuntime.ts`, `src/context/agentPreviewHelpers.ts`, `desktop/lib/preview.mjs`, `desktop/lib/previewResolver.mjs`, and `backend/app/Services/Concerns/ProjectPreview.php`.

Inline generated previews must be self-contained. `appWebViewPreview.preparePreviewHtml()` strips unresolved relative scripts/stylesheet links on both native and web; `ChatEndpointHelpers.extractRunnableApp()` rejects `<vibyra-app>` HTML that references local scripts/styles/modules; `chatPreviewFallback.ts` can bundle fenced `index.html` plus companion `main.jsx`/CSS blocks into one runnable preview.

Diagnostic split: "Do not reference local files such as main.jsx..." belongs to the inline AI preview guard/fix prompt (`ChatEndpointHelpers.php`, `previewFixPrompt.ts`), while "webview: could not connect to the server" means `AppWebView.native.tsx` was opening a URL preview that the phone could not reach. Fixes should either bundle generated `index.html` + entry files into one inline preview, or verify/return a phone-reachable desktop dev-server URL before attaching the Live Preview card. `src/utils/previewUrls.ts` owns desktop preview URL candidate generation and reachability: after `/preview/start-server`, mobile rewrites the returned dev-server port onto each known desktop LAN host, fetches the candidate HTML/assets, and only attaches the Live Preview card for the first URL the phone can load.

The mobile reachability check must not treat a 5xx from a Vite source module such as `/resources/js/app.tsx` as a Vibyra Desktop connectivity failure. The bridge route can be reachable while the target app has a Vite transform/runtime error; allow the preview to open so `AppPreviewModal` diagnostics can show the real app failure. Continue rejecting ordinary failed bundled assets.

React/Laravel preview startup is a cold-start path, not a normal short desktop request. Mobile allows `/preview/start-server` up to 90s, and desktop `startPreviewServer()` passes an 80s verification window into `startProjectDevServer()`. Laravel+Vite readiness probes run PHP and Vite checks in parallel with short per-probe timeouts so the request waits for real startup instead of timing out around 35s. Relevant files: `src/context/useRequests.ts`, `desktop/lib/pairingHandlers.mjs`, `desktop/lib/previewLaravelDevServer.mjs`, `desktop/lib/preview.test.mjs`.

Started preview servers are exposed to the phone through the Vibyra Desktop bridge, not direct Laravel/Vite ports. `/preview/start-server` returns `/preview/server/{projectId}/{token}/`; `desktop/lib/preview.mjs` proxies that route to the tracked local dev server and rewrites root-relative assets plus local/private Vite URLs through bridge proxy routes. This avoids same-Wi-Fi/firewall failures where the phone can reach port `4317` but cannot reach app ports like `8000` or `5174`.

Vite/Laravel output can reference `http://0.0.0.0:<port>/...`; the bridge proxy must normalize local/private proxy targets to `127.0.0.1` before fetching because `0.0.0.0` is only a bind address. Explicit project preview commands should prefer the real PC project route/files over older generated `ChatMessage.app` previews; source-only HTML with local scripts/styles such as `/resources/js/app.tsx`, `/src/main.jsx`, or `/style.css` is not self-contained phone HTML and should trigger desktop dev-server startup instead of being attached inline. Relevant files: `desktop/lib/preview.mjs`, `src/screens/workspace/hooks/workspaceChatRuntime.ts`, `src/utils/previewHtml.ts`.

Laravel+Vite projects must skip all static preview entries, including a stray root `index.html`, and go through the Laravel/PHP plus Vite dev-server path. Detect both `laravel/framework` and escaped composer JSON forms such as `laravel\/framework`; otherwise Vibyra can show a stale generated static page instead of the real Inertia app. Relevant files: `desktop/lib/preview.mjs`, `backend/app/Services/Concerns/ProjectPreview.php`, `desktop/lib/preview.test.mjs`, `backend/tests/Feature/VibyraAppApiTest.php`.

For Laravel/Inertia phone-preview HTTP 419 reports, first distinguish target-project bugs from preview-proxy transport bugs. The desktop proxy must forward non-GET request bodies plus `cookie`, `x-csrf-token`, `x-xsrf-token`, `x-inertia`, and `x-requested-with`, normalize safe `Origin`/`Referer`/forwarded headers to the upstream app, rewrite form `action`/`formaction`, keep runtime `fetch`/XHR/form submits inside `/preview/server/{project}/{token}/`, rewrite `Location` / `X-Inertia-Location`, and rewrite `Set-Cookie` onto the preview path. Diagnostic 419 HTML should still open in the preview modal so users can send it to AI. Regression coverage lives in `desktop/lib/preview.test.mjs` and `src/utils/previewUrls.test.mjs`. If chat shows "waiting for your permission before editing files", no target-project patch has been applied yet.

## Preview Mini Chat

`AppPreviewModal` owns the runnable-preview overlay UI. It renders `AppPreviewMiniChat` as a bottom-right AI chat icon that expands into a small textbox over the WebView. Preview edit submits must call `useWorkspaceActions.submitPreviewEdit`, which chooses `runtime.activeProjectTarget()`, opens that project chat, and then calls `app.startAgent(target, prompt)`. Do not route mini-preview edits through the generic `onStartChat` path: detached chats intentionally fall back instead of starting an agent, so the mini edit would appear to do nothing. After send, the mini composer closes immediately and `AppPreviewEditStatus` shows a compact model-aware status pill over the preview, cycling through chat-style phases (`Reading your prompt`, `Running <selected model>`, `Preparing answer`) before a checkmark completion animation and fade-out. The preview modal tracks native keyboard height and adds it to the mini chat and diagnostics bottom offsets so phone keyboards do not cover the prompt box; the done pill should use a short first-person AI completion message such as "I fixed the preview issue..." or "I implemented your preview change...". `WorkspaceScreen` keeps an open preview modal refreshed by swapping in the newest `ChatMessage.app` from the active chat thread when an agent result returns a new preview.
