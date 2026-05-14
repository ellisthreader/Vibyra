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

Generated preview prompts must also prevent the problem at source. `backend/app/Http/Controllers/Concerns/ChatPrompting.php` and `backend/app/Services/Concerns/OpenAiStreaming.php` tell models not to invent image asset URLs or Vibyra asset CDN paths, and to use canvas, inline SVG, CSS shapes/gradients, emoji/icons, or verified/generated inline assets instead. New standalone builds should not rely on external script CDNs, ESM imports, or CDN framework globals for core behavior; games/3D should prefer inline browser-native canvas/WebGL/CSS/SVG. Phaser prompts should prefer generated textures over `this.load.image(...)` with fake, local, or unverified sprite URLs.

User-facing preview guidance must assume the user is in the phone app. `ChatPrompting.php`, `OpenAiStreaming.php`, and `ChatReplyGuard.php` tell/force preview replies toward the in-app Live Preview card instead of `localhost`/`127.0.0.1`; explicit backend/dev setup prompts may still mention local URLs.

`chatPreviewFallback.ts` wraps fenced React snippets in a browser runnable shell. It supplies lightweight router shims (`BrowserRouter`, `HashRouter`, `Routes`, `Route`, `Link`, etc.) because AI often emits React Router components without importing `react-router-dom`; without the shims the preview crashes with `ReferenceError: BrowserRouter is not defined`.

## Open Behavior

The chat path should not auto-open the preview modal. It should add a tappable preview card, and the modal opens only when the user taps the card.

Desktop agent code-change replies attach a Live Preview card only after changes are applied and the changed files look browser-previewable, or when the result includes a generated `index.html`. Pending edits and generic backend/config/test code changes keep the code changes card without preview UI. Relevant files: `src/context/agentPreviewHelpers.ts`, `src/context/useAgentResultHandlers.ts`, `src/context/useEditPermissionActions.ts`.

Explicit preview/open-on-phone intents add the preview card to the assistant reply. Preview trouble prompts like "why is it blank" are handled locally and re-offer the preview card instead of sending a `.vibyra-agent/runs/*.md` question to the agent.

Preview intent handling uses `runtime.runnablePreviewApp()` to resolve the active preview and passes it to `addLocalChatReply`, so prompts like "run this code" produce a tappable Live Preview card in chat instead of text-only "tap the card" guidance. The resolver checks existing `ChatMessage.app`, fenced code via `chatPreviewFallback.ts`, loaded project files, and verified desktop preview URLs.

The `/preview` command is the canonical project-scoped command; `/test` is an alias. `workspaceChatRuntime.openRunnablePreview()` must look only at the active visible/project thread before falling back to that project's files or a verified desktop preview URL; do not scan all `chatThreads` or reuse the previous global `previewApp`, or an old preview from another project can open. `workspacePreviewProbe.ts` fetches the desktop preview URL first and refuses the analyzed-project fallback, so `/preview` opens a real static/browser entry or reports that no runnable preview exists instead of showing "Project analyzed".

Opening a file from chat is not a preview action. `workspacePromptActions.runFileOpen()` clears `previewApp` before `app.selectFile(file.id)` so an already-open project preview WebView cannot remain visible and show a stale desktop fallback while the user is trying to inspect source.

## Intent Routing

`isViewPreviewIntent` in `chatReplies.ts` matches preview/open/view/run wording around website/site/page/app/preview/index.html/html/build plus phrases like "open it on my phone" and bare `preview`.

In project chat, preview intent routes through `handleWorkspacePreviewIntent()` before `app.startAgent`. It calls `openRunnablePreview()` so explicit preview/open-on-phone prompts use the same modal path as `/preview` and Live Preview card taps. If no runnable preview exists, it reports that instead of attaching the desktop analyzed-project fallback. In detached chat, it uses `previewNeedsProjectReply()`.

This branch must run before `app.startAgent`; otherwise prompts such as "open the app on my phone" can be mis-treated as code edits.

Preview crash-fix prompts generated by `AppPreviewErrorPanel.buildFixPrompt()` are an exception: `workspacePromptActions.isPreviewFixPrompt()` must route them to `app.startAgent` before `handleWorkspacePreviewIntent()`, or the crash text is misclassified as a preview-open request and reopens the modal instead of fixing code.

Crash-fix and preview-edit prompts must force build mode in `useAgentActions.shouldUseBuildChatMode()` and `startAgent()` returns a boolean so `AppPreviewModal` only shows done after a run actually starts/completes. `AppPreviewModal` clears diagnostics on reload and on app content fingerprint changes, not just `app.id`.

## Project Preview Guard

`openProjectPreview` checks whether the project id exists in `app.projects` before opening the in-app desktop preview. Unknown restored/adopted projects fall back to opening chat directly to avoid stale desktop `/preview/project/{id}/{token}/` 404 shells.

Opening or accepting an analyzed desktop folder now creates a desktop preview modal immediately, even when `briefRequired` is still waiting for user confirmation. The WebView URL is safe because the desktop preview route decides whether to serve a real static browser entry or a phone-viewable analyzed-project fallback. Relevant files: `src/screens/workspace/hooks/workspaceFolderActions.ts`, `src/screens/workspace/hooks/workspaceChatRuntime.ts`, `desktop/lib/preview.mjs`, `desktop/lib/previewResolver.mjs`.

Inline generated previews must be self-contained. `appWebViewPreview.preparePreviewHtml()` strips unresolved relative scripts/stylesheet links on both native and web; `ChatEndpointHelpers.extractRunnableApp()` rejects `<vibyra-app>` HTML that references local scripts/styles/modules; `chatPreviewFallback.ts` can bundle fenced `index.html` plus companion `main.jsx`/CSS blocks into one runnable preview.

## Preview Mini Chat

`AppPreviewModal` owns the runnable-preview overlay UI. It renders `AppPreviewMiniChat` as a bottom-right AI chat icon that expands into a small textbox over the WebView. Preview edit submits must call `useWorkspaceActions.submitPreviewEdit`, which chooses `runtime.activeProjectTarget()`, opens that project chat, and then calls `app.startAgent(target, prompt)`. Do not route mini-preview edits through the generic `onStartChat` path: detached chats intentionally fall back instead of starting an agent, so the mini edit would appear to do nothing. After send, the mini composer closes immediately and `AppPreviewEditStatus` shows a compact model-aware status pill over the preview, cycling through chat-style phases (`Reading your prompt`, `Running <selected model>`, `Preparing answer`) before a checkmark completion animation and fade-out. The preview modal tracks native keyboard height and adds it to the mini chat and diagnostics bottom offsets so phone keyboards do not cover the prompt box; the done pill should use a short first-person AI completion message such as "I fixed the preview issue..." or "I implemented your preview change...". `WorkspaceScreen` keeps an open preview modal refreshed by swapping in the newest `ChatMessage.app` from the active chat thread when an agent result returns a new preview.
