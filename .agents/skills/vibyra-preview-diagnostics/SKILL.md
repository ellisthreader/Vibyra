---
name: vibyra-preview-diagnostics
description: Diagnose and fix Vibyra Preview failures across Desktop Test, phone project previews, generated-app WebViews, and interactive website or game projects. Use for blank or stale previews, wrong-project frames, failed starts, target switching, asset errors, proxy failures, mobile reachability failures, lost AI-edit drafts, or Preview shutdown leaks.
---

# Vibyra Preview Diagnostics

Trace Preview end to end before changing UI copy or adding fallbacks. The same
visible failure can originate in project identity, target detection, process
startup, capability routing, proxy transport, asset validation, or WebView
state.

## Required Context

Read `Memory Protocol.md`, `Context Map.md`, and `Project Context.md`, then:

- Desktop target, process, proxy, or Test panel: read
  `Vibyra Desktop Memory.md` and `Desktop/Projects And Preview.md`.
- Phone WebView, generated app, diagnostics, or mini chat: read
  `Vibyra App Memory.md` and `App/Live Preview.md`.
- Cross-device failures: read both focused Preview notes.

For invalid tokens, reconnects, or LAN timeouts, read
`Vibyra/_ai/App/Pairing And Connection.md`. Use `vibyra-expo-web-diagnostics`
for Metro bundle 500s, JSON MIME errors, and missing modules. Only work on
Preview visual design after functional Preview behavior is correct.

## Capture The Failure

Record the exact surface, project ID/path, target ID, framework, command,
working directory, response URL/status, and transition that failed. Distinguish
first start, reopen, reload, target switch, project switch, form submission,
and shutdown. Never expose bearer or capability secrets.

## Failure Map

| Symptom | Inspect first |
| --- | --- |
| Blank or no runnable Preview | Project identity, nested app root, entry and target detection |
| Old project appears after switching | Request/project/target stale-response guards |
| Phone frame changes with Desktop target | Target-pinned capability and active alias |
| Desktop works but phone rejects it | LAN candidates, `<base href>`, asset probes |
| Assets, forms, or navigation fail | HTML/CSS/runtime rewriting and proxy transport |
| Laravel/Inertia returns 419 | Body, cookies, CSRF/XSRF, Origin/Referer, redirects |
| Same-size HTML keeps old errors | Full content fingerprint rather than HTML length |
| Failed AI edit loses text | Mini-chat rejection and draft retention |
| Desktop hangs on exit | Tracked process groups and fail-safe shutdown |
| Preview right-click does nothing | Inspector runtime injection, renderer asset order, resolver route, frame reload |

## Diagnostic Sequence

1. Confirm the source project ID resolves to the intended absolute path.
   Check shared nested app-root detection before assuming framework markers
   live at the selected folder root.
2. Re-detect the target immediately before start. Do not let static placeholder
   HTML override Laravel/Vite, Expo, SPA, backend/frontend, or game runtimes.
   A package-script alias may resolve through at most four safe local aliases.
   A local Node wrapper is runnable only when its canonical file stays inside
   the selected project, is at most 128 KiB, forwards runtime arguments, and
   contains a recognized child framework launch; reinspection closes the normal
   edit-between-inspect-and-Run window. Keep arbitrary, out-of-project, oversized,
   non-forwarding, and shell-chained wrappers unavailable.
3. Trace the explicit approved start into `startProjectDevServer()`. Check the
   command, cwd, readiness probe, timeout, generation, port reservation,
   startup feed, and reuse of an existing verified runtime.
4. Reproduce slow-start races. Start, activate, and stop results must remain
   scoped to the initiating request, project, and target.
5. Verify phone URLs come from Preview endpoint responses. Pin running-service
   capabilities to their target, reject untracked local ports, and allow only
   the newest concurrent phone request to commit its Preview.
6. Follow `/preview/project/...` or `/preview/server/...` to the upstream app.
   Check relative assets, matching-quote `<base href>`, Vite modules, fetch,
   XHR, forms, redirects, cookies, CSRF headers, and `Set-Cookie` rewriting.
   Keep binary/range responses streamed. Mutable HTML/CSS/JavaScript rewriting
   uses a shared aggregate buffer budget from `previewProxyLimits.mjs`; do not
   replace it with a very low global request-concurrency limit that breaks
   ordinary parallel asset loading.
7. Verify mobile host fallback and WebView state. Content identity must include
   ID, URL, and an HTML hash. Failed AI edits retain the user's draft.
8. Verify Stop and shutdown terminate only tracked Preview process groups.
   Keep detection/adoption separate from execution: read/open flows may call
   `adoptRunningProjectDevServer()` but must never reach a spawning fallback.
   Only explicit approved start routes may call `startProjectDevServer()`.
   During a fresh managed start, readiness may probe only the reserved port,
   ports parsed from that child's output, and ports newly occupied after the
   pre-spawn snapshot. Never accept an untracked common-port service while the
   selected child is still starting. Externally adopted services have no owned
   process and Stop must leave them alive.
   Cleanup errors must not prevent bridge close or process exit.
   Removing a service from active Preview state must not make its child
   untracked: retain termination ownership until exit, send the tracked process
   group SIGTERM, and use a bounded SIGKILL escalation when it does not exit.
   Never escalate by executable name or occupied port.
9. For element editing, confirm proxied HTML contains
   `vibyra-preview-inspector`, Desktop loads inspector data before inspector UI,
   the active iframe is the message source, and the element-resolution command
   receives the current project and target app directory. Exact framework source metadata should resolve before
   fallback scanning, and fallback scans should start inside that target app.
   Do not gate Send on source resolution: the DOM/component context remains a
   valid agent prompt when matching is slow or inconclusive. Terminal assignment
   must have a bounded acknowledgement timeout so the composer can recover from
   a stalled request. Reuse only a standalone project terminal or the Team
   Builder/writer; coordinator, reviewer, verifier, and other read-only Team
   roles cannot implement Preview edits. Assignment failure must return to the
   inspector instead of clearing the draft or reporting success. Structure the
   agent prompt as TASK, TARGET, IMPLEMENTATION, and SECURITY sections; isolate
   the user request, report source confidence, mark TARGET metadata untrusted,
   and prefer semantic IDs, test IDs, roles, and ARIA labels over generated CSS
   classes in the DOM path. The compact UI automatically uses the highest-ranked
   candidate for ambiguous fallback matches while preserving `best-match`
   confidence in the agent prompt. Treat WebView/iframe source metadata as
   container ownership unless the selected DOM element is the iframe itself:
   prefer a nearer fiber source, then rank inner-element text, ID, test ID,
   ARIA, role, and class evidence instead of letting `AppWebView` win as an
   unconditional exact match. Reload an
   already-open Desktop renderer and refresh its Preview after changing
   injected runtime or shell assets.
   More generally, do not accept any reported React source line as exact unless
   its nearby source contains the selected DOM tag. Broad App, Page, Screen,
   Layout, Root, Main, Index, and Shell sources also need another nearby element
   signal. Rank visible JSX text rather than arbitrary substrings, and include
   `name`, `placeholder`, `title`, `alt`, and `href` alongside ID, test ID,
   ARIA, role, and classes so textless controls can resolve to leaf components.

Do not weaken proxy authorization, bypass explicit Run approval, or kill
processes by executable name or port to make a Preview appear healthy.

For Rust/Tauri workspace Preview, audit these invariants separately:

- Bound manifest bytes before allocating the full file and consume child output
  in fixed chunks with a cap that applies even when no newline arrives.
- Reserve every port for a multi-process recipe before any spawn, retaining each
  listener until its child starts. Services are concurrent by normalized project
  root plus target; selecting another target must not stop a background service.
- Keep renderer status, request generations, and errors target-scoped. Serialize
  polls so one target cannot overlap itself, ignore stale lifecycle responses,
  retry transient status errors, and clear the URL on failed or timed-out state.
- Do not re-canonicalize a tracked service key during status or Stop; cleanup
  must still find the service after its project directory has been deleted.
- Cap static-server connections and header bytes, set read/write timeouts, and
  accept fragmented request headers. Run blocking detection, spawn, Stop, and
  readiness work outside Tauri's invoke/UI thread.
- Treat Expo Go and Expo development-build package scripts as sources for an
  embedded Expo **web** target by appending `--web` plus Vibyra's reserved host
  and port. The phone frame cannot embed a native runtime. Ionic serve,
  Capacitor-backed web bundlers, and React Native Web bundlers use phone viewport
  hints; native-only React Native remains unavailable instead of showing a false
  browser Preview.

If Expo Router shows `Unmatched Route` only inside Desktop Preview, inspect the
browser pathname for the tokenized `/preview/server/...` prefix. Normalize it
before the Router entry script runs, retain the prefix separately for request
rewrites, and cover the real `expo-router/entry.bundle` marker in regression
tests. Cold Expo readiness probes need a framework-sized timeout and must drain
successful bundle responses rather than aborting Metro mid-render. Apply the
same framework-sized allowance to the authenticated Expo proxy root; otherwise
startup can verify while the first iframe request still times out. Keep the
shorter default for other targets.

For terminal-triggered Preview, inspect the intent chain separately from the
preview runtime: `vibyra preview`, renderer `/preview`, or a bounded standalone
natural-language match in `app.terminals-companion-input.js` -> terminal-scoped
loopback action -> pending desktop state -> renderer controller -> existing
target detection/start. A matched natural request clears the provider composer
and suppresses Enter before model submission; ambiguous and compound prompts
must pass through unchanged. The action route must accept an empty body only,
derive the project from the live terminal, and never start a process. With
multiple eligible targets, the renderer opens the existing picker; the model
never chooses a path, project, command, port, or target.
The invoking terminal must reuse its normal dismissible notice surface for this
lifecycle: show `Opening Preview in the right sidebar...` before the workspace
transition, and confirm `Preview opened in the right sidebar.` only after the
Preview companion is mounted and any required target activation/start returns
a real URL. A multi-target picker may confirm that Preview opened while asking
the user to choose an app. Startup, activation, stale-transition, or mount
failure must retain the actionable error notice and must never acknowledge the
action as handled or claim that Preview opened.
Treat a service marked Running with a dead upstream as stale state: activation
must verify the exact tracked target, remove only that target when verification
fails, and let the renderer retry through the existing approved start route.
Do not skip activation merely because the same target URL is already visible.
Persist explicit per-project target choice so a later terminal Preview request
can deterministically reopen or restart the user's app without model selection.

## Source Ownership

- Rust/Tauri workspace Preview: `desktop-tauri/src/components/preview/`,
  `desktop-tauri/src/components/layout/ProjectWorkspace.tsx`,
  `desktop-tauri/src/ipc/preview.ts`,
  `desktop-tauri/src-tauri/crates/vibyra-core/src/preview/`, and
  `desktop-tauri/src-tauri/src/commands/preview.rs`
- Phone reachability: `src/utils/previewUrls.ts`
- WebView state: `AppPreviewModal.tsx`, `AppPreviewMiniChat.tsx`,
  `previewAppFingerprint.ts`

## Verification

Run:

```bash
node --test src/utils/previewUrls.test.mjs src/utils/previewHtml.test.mjs src/utils/previewSecurity.phaseB.test.mjs src/screens/workspace/inline/previewFixPrompt.test.mjs src/screens/workspace/inline/previewAppUi.test.mjs src/components/webViewNavigationPolicy.test.mjs
(cd backend && php artisan test --filter='Vibyra(ProjectPreview|PreviewPrompt)')
npm run typecheck
(cd desktop-tauri && npm run build && npm run core:test)
git diff --check
```

Manually test a
static site, Vite/React SPA, Laravel/Inertia form flow, Expo web app, and any
canvas/WebGL game capabilities involved. Include first start, reopen, reload,
mid-start switching, concurrent targets, phone/Desktop use, Stop, and shutdown.
For a delegated mobile package wrapper, do not stop at a detection assertion:
start it through `PreviewManager`, wait for `Running`, require an HTTP 200 from
the returned reserved-port URL, Stop it, and confirm the managed port closes
without terminating an already-running Expo Go or development-build server.
Do not claim game or device-specific completeness from unit tests alone.
For the Rust/Tauri shell, also compile the full `src-tauri/Cargo.toml` workspace;
on Linux use the repository's existing dev-shim path or `npm run app:build` so
GTK/WebKit pkg-config metadata resolves without changing system packages.

Update the smallest Preview memory note and this skill when the workflow or
validation contract changes.
