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

LAN pairing, bridge-token, and reconnect failures belong to the retired
Electron companion and are not native Tauri Preview failures. Read
`Vibyra/_ai/App/Pairing And Connection.md` only when auditing the remaining
mobile legacy flow. Use `vibyra-expo-web-diagnostics` for Metro bundle 500s,
JSON MIME errors, and missing modules. Only work on Preview visual design after
functional Preview behavior is correct.

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
3. Trace the explicit approved start through the Tauri Preview command into the
   Rust core. Check the command, cwd, readiness probe, timeout, generation,
   port reservation, startup feed, and reuse of an existing verified runtime.
4. Reproduce slow-start races. Start, activate, and stop results must remain
   scoped to the initiating request, project, and target.
5. Pin running services to their exact project and target, reject untracked
   local ports, and allow only the newest concurrent request to commit Preview
   state.
6. Follow the returned Preview URL to the upstream app. Check relative assets,
   Vite modules, fetch, XHR, forms, redirects, cookies, and framework-specific
   routing.
   On macOS, check that accepted static-server sockets are explicitly returned
   to blocking mode before bounded reads. They inherit the nonblocking
   listener flag; fragmented headers otherwise reset the connection. Run
   `preview::tests_static::accepts_a_request_head_split_across_packets` on Mac.
7. Verify mobile host fallback and WebView state. Content identity must include
   ID, URL, and an HTML hash. Failed AI edits retain the user's draft.
8. Verify Stop and shutdown terminate only tracked Preview process groups.
   Cleanup errors must not prevent bridge close or process exit.
9. For element editing, confirm proxied HTML contains
   `vibyra-preview-inspector`, Desktop loads inspector data before inspector UI,
   the active iframe is the message source, and the Tauri element-resolution
   command receives the current project and target app directory. Exact
   framework source metadata should resolve before
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

## Native Window Control

For native phone window input, read `Desktop/Native Remote Input Authorization.md`.
Carry the exact Stream, immutable local consent, current Binding/Session token and
typing state through a borrowed synchronous callback. Use nonblocking consent
snapshots; recheck authority after sequence waits and target queries. Before each
new OS effect, require the same target window or focused descendant, then recheck
authority. Never retain callback context on async queues or recursively enter X11
connection/inventory locks. Only releases paired with posted downs and restoration
of a borrowed keyboard mapping may finish after denial. Preserve queued revoke/
close zero-effect tests, mid-batch focus/revoke tests and explicit local paths;
native release acceptance requires the exact platform workflows.

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

Manually test a static site, Vite/React SPA, Laravel/Inertia form flow, Expo web
app, and any canvas/WebGL game capabilities involved. Include first start,
reopen, reload, mid-start switching, concurrent targets, phone/Desktop use,
Stop, and shutdown.
Do not claim game or device-specific completeness from unit tests alone.

Update the smallest Preview memory note and this skill when the workflow or
validation contract changes.


Validate native Preview changes on both Mac release CI and
`desktop-nonmac-validation.yml`, dispatched on the same frozen source SHA.
The dispatch-only workflow is registered on default main (27af5db0,
workflow371060173); Windows/Linux run full verify and strict all-target Clippy,
and Linux runs actual native IPC isolation under dbus/Xvfb. It publishes no
packages and uses no signing secrets. Compile tests do not establish physical
OS input acceptance.


Run Linux full native `npm run verify` under dbus/Xvfb because Preview Run checks
X11 availability; retain the separate actual WebKit IPC gate afterwards. Use
native Windows/Unix PTY fixtures with fixed commands, keep queued revocation and
Noise checks active, and set fixture Git core.autocrlf=false for byte assertions.
Attached fixture listeners belong to their advertised cwd on all desktop
platforms. Linux desktop-entry parser tests use Unix path semantics on every host.


For a latched pre-input focus regression, synchronize on the fake's pending focus
delivery and its exact 60 ms deadline before releasing the old read. The input log
is written before delivery; elapsed time from that receipt can race a descheduled
tap thread. Retain the original 400 ms bound and one-reader/freshness assertions.

Mac release gates set RUST_TEST_THREADS=1 for full npm verification; the reused
Mac job previously limited test cases to two threads. Serial cases reduce fixture
competition while all tests, 400 ms assertions and explicit in-test race threads
remain active. A bounded read cannot prevent an external host scheduling pause;
the exact CI descheduling cause remains unmeasured. Keep Linux and Windows
validation scheduling unchanged.
