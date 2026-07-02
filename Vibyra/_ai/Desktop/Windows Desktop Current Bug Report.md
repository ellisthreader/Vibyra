# Windows Desktop Current Bug Report

Date captured: 2026-07-01.
Scope: Vibyra Windows desktop app, AI terminal launch and PTY interaction.
Status: fixed and regression-covered on 2026-07-02.

## Summary

The Windows desktop AI terminal experience had eight high-priority reported
regressions:

1. GPT/Codex terminals launched with Full access still ask the user to approve
   actions.
2. Every newly launched terminal asks to update again.
3. Terminal text cannot be copied.
4. Links rendered in terminal output cannot be opened.
5. Typing in terminals is buggy and can spam or glitch characters/keys.
6. Pressing F8 starts voice capture, but pressing F8 again does not stop it;
   the user must click manually to stop talking/listening.
7. While typing in terminals, the spacebar sometimes does not insert spaces.
8. The terminal model picker is not getting the latest OpenRouter models,
   including newly available Anthropic models reported by the user.

Treat the sections below as the historical report plus the 2026-07-02 fix
record. Future changes touching these paths should keep the listed regression
coverage passing or add narrower coverage for the new behavior.

## 2026-07-02 Fix Record

Verification:

- Ran `node --test desktop/assets/app.terminals-input.test.mjs desktop/assets/app.terminals-editor.test.mjs desktop/assets/app.terminals-voice-input.test.mjs desktop/assets/app.terminals-models.test.mjs desktop/lib/openRouterModels.test.mjs desktop/electron-main.test.mjs desktop/lib/aiTerminalVibyraShell.test.mjs desktop/lib/aiTerminalProcess.test.mjs`.
- Result: 108 tests, 105 passed, 3 skipped Linux-only, 0 failed.
- Ran `git diff --check`; it passed with Windows line-ending warnings only.

Bug 1 - Full access:

- Diagnosis: solo GPT/Codex Full access launch was already correct. The
  process contract passes `--dangerously-bypass-approvals-and-sandbox` and does
  not pass `--ask-for-approval` for Full access.
- Fix: no code change required for solo Full access. Existing
  `desktop/lib/aiTerminalProcess.test.mjs` coverage confirms the native Codex
  bypass args. If a Team terminal still prompts, first check Team role policy:
  non-writer/reviewer roles may intentionally downgrade write capability.
- Guardrail: Full access remains a runtime arg contract, not a UI label.

Bug 2 - repeated update prompts:

- Diagnosis: Vibyra-token Codex homes could omit safe Codex startup cache while
  still excluding user config, causing repeated first-run/update/migration
  prompts in fresh isolated homes.
- Fix: `desktop/lib/aiTerminalVibyraShell.mjs` now copies safe startup state
  into managed homes while still excluding unsafe user-owned config and auth:
  `models_cache.json`, `version.json`, `installation_id`,
  `.personality_migration`, and shared `.tmp/plugins` marketplace cache are
  allowed; `auth.json`, user `config.toml`, `requirements.toml`, `skills`, and
  installed `plugins` remain excluded.
- Guardrail: `desktop/lib/aiTerminalVibyraShell.test.mjs` verifies safe startup
  cache is preserved without copying user config.

Bug 3 - terminal copy:

- Diagnosis: copy handling could miss Windows/Electron focus paths where the
  xterm wrapper, not the xterm textarea, owned focus.
- Fix: `desktop/assets/app.terminals-pty-runtime.js` now has a capture-phase
  document `copy` fallback that prefers xterm selection, then highlighted DOM
  text, then the Electron clipboard bridge without stealing Ctrl+C interrupt
  when there is no selection.
- Guardrail: `desktop/assets/app.terminals-input.test.mjs` covers document copy
  and xterm selection copy.

Bug 4 - terminal links:

- Diagnosis: terminal output links lacked a single trusted Windows Electron
  external-open bridge, and plain terminal-editor URLs were not consistently
  detected.
- Fix: `desktop/electron-preload.cjs` exposes
  `window.vibyraDesktopLinks.openExternal`; `desktop/electron-main.cjs`
  validates and opens only trusted `http:`, `https:`, and `mailto:` URLs.
  `desktop/assets/app.terminals-editor-runtime.js` detects plain URLs, and
  `desktop/assets/app.terminals-pty-runtime.js` opens OSC-8 xterm links through
  the same bridge.
- Guardrail: `desktop/electron-main.test.mjs` and
  `desktop/assets/app.terminals-editor.test.mjs` cover URL validation and link
  detection/opening.

Bug 5 - typing spam/glitches:

- Diagnosis: Windows Electron could duplicate or glitch input through xterm
  accessibility DOM behavior, wrapper focus transitions, and overlapping
  fallback input sends.
- Fix: `desktop/assets/app.terminals-pty-runtime.js` keeps
  `screenReaderMode: false`, adds a wrapper-focus keydown fallback that only
  fires when xterm did not already handle the event, serializes HTTP fallback
  `/input` requests while WebSocket is down, and preserves cursor visibility
  control sequences instead of stripping live terminal state.
- Guardrail: `desktop/assets/app.terminals-input.test.mjs` covers xterm
  screen-reader mode, single-owner wrapper key input, serialized fallback HTTP
  input, and cursor visibility preservation.

Bug 6 - F8 voice toggle:

- Diagnosis: renderer F8 handling could start voice capture while the Electron
  focused-window path did not reliably call the same toggle/stop state path, so
  the second F8 could be lost when focus was inside terminal UI.
- Fix: `desktop/electron-main.cjs` forwards focused-window F8 keydown to the
  renderer, `desktop/electron-preload.cjs` exposes a narrow
  `vibyraDesktopVoiceInput.onToggle` listener, and
  `desktop/assets/app.terminals-voice-input.js` routes DOM F8, IPC F8, and
  manual control through one de-duped toggle path that stops/release tracks.
- Guardrail: `desktop/electron-main.test.mjs` and
  `desktop/assets/app.terminals-voice-input.test.mjs` cover the F8 bridge and
  shared toggle behavior.

Bug 7 - missing spaces:

- Diagnosis: when focus was on the terminal wrapper instead of xterm internals,
  Space could be treated as wrapper activation or bypass xterm's normal input
  path.
- Fix: the same `desktop/assets/app.terminals-pty-runtime.js` wrapper-focus
  fallback forwards Space to the active connected xterm exactly once and skips
  the fallback when xterm already handled the key.
- Guardrail: `desktop/assets/app.terminals-input.test.mjs` proves wrapper
  Space reaches the PTY once.

Bug 8 - latest OpenRouter models:

- Diagnosis: the model picker could serve stale catalog data and cap Anthropic
  group results by quality in a way that hid newest terminal-capable models
  behind older high-quality rows. Live OpenRouter verification on 2026-07-02
  showed current Anthropic slugs including `anthropic/claude-sonnet-5` and
  `anthropic/claude-fable-5`; the user-reported "fabel 5" maps to Claude
  Fable 5.
- Fix: `desktop/lib/openRouterModels.mjs` reserves newest rows per company
  before quality filling and supports a forced refresh. `desktop/lib/desktopRoutes.mjs`
  accepts `?refresh=1`. `desktop/assets/app.terminals-models.js` requests
  `cache: "no-store"` refreshes and allows provider-qualified dynamic
  OpenRouter slugs to remain visible.
- Guardrail: `desktop/lib/openRouterModels.test.mjs` and
  `desktop/assets/app.terminals-models.test.mjs` cover newest Anthropic
  visibility and dynamic row filtering.

## Bug 1 - Full Access Still Requires Approval

Observed:

- When launching GPT/Codex terminals with Full access, the terminal still asks
  the user to approve actions.
- User expectation is that Full access means Vibyra has already applied the
  explicit bypass mode for that terminal and the agent does not keep prompting
  for action approval.

Expected behavior:

- Full access is an explicit launch-time capability.
- Codex/GPT full-access launches should use Codex's real bypass mode:
  `--dangerously-bypass-approvals-and-sandbox`.
- Full access should not also pass standard approval flags such as
  `--ask-for-approval on-request`.
- Standard mode may ask for approval; Full access should not.

First files to inspect:

- `desktop/lib/aiTerminalProcess.mjs`
- `desktop/lib/aiTerminalOpenRouterCli.mjs`
- `desktop/lib/aiTerminalRuntimeCatalog.mjs`
- `desktop/assets/app.terminals-team.js`
- `desktop/assets/app.terminals-setup-flow.css`

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` says Full access must use each
  runtime's real bypass command and must never be just a cosmetic label.
- `.agents/skills/vibyra-ai-terminal-diagnostics/SKILL.md` has the runtime
  flag matrix for Codex, Claude, Gemini, Qwen, Kimi, Mistral, Grok, and
  Vibyra Agent.

Likely diagnostic path:

- Capture the terminal creation payload from the Windows desktop setup UI.
- Query the authoritative terminal descriptor from `/desktop/pty-terminals`.
- Confirm `accessMode` / equivalent launch metadata is Full access.
- Inspect the child process args for Codex/GPT and verify whether
  `--dangerously-bypass-approvals-and-sandbox` is present and whether
  `--ask-for-approval` is still present.

## Bug 2 - Every Terminal Repeats Update Prompt

Observed:

- Every launched terminal asks to update.
- This happens on every single terminal rather than once or only when a real
  update is required.

Expected behavior:

- Isolated terminal homes should seed or preserve safe startup state so native
  CLIs do not repeat first-run/update/migration prompts per terminal.
- Codex startup should acknowledge supported model-migration notices with the
  selected model's `notice.model_migrations={...}` override while preserving
  the user's selected model.
- Native provider update prompts should be disabled or contained where the
  managed provider contract says updates are Vibyra-owned.

First files to inspect:

- `desktop/lib/aiTerminalProcess.mjs`
- `desktop/lib/aiTerminalPersistentProcess.mjs`
- `desktop/lib/aiTerminalWorker.mjs`
- `desktop/lib/aiTerminalRuntimes.mjs`
- `desktop/lib/providerAccountState.mjs`

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` records the Codex model-migration
  notice handling and safe startup cache seeding.
- `Vibyra/_ai/Desktop/Native Provider Terminal Plan.md` records provider
  rollout requirements to disable or control native update behavior.

Likely diagnostic path:

- Identify the exact prompt text and provider runtime that is asking to update.
- Compare the isolated terminal home contents before and after accepting or
  dismissing the prompt.
- Verify whether the same migration/update marker is copied or linked into new
  terminal homes.
- Check whether Windows path handling prevents the expected cache or marker
  files from being found.

## Bug 3 - Cannot Copy From Terminals

Observed:

- User cannot copy selected text from AI terminals.

Expected behavior:

- xterm selection should copy through terminal selection first.
- Highlighted DOM text inside the xterm element should be a fallback.
- Native copy events, Ctrl/Cmd+C, Ctrl+Shift+C, and the Electron
  `vibyraDesktopClipboard` bridge should cooperate.
- Ctrl/Cmd+C with no selection should still send an interrupt to the PTY.

First files to inspect:

- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-pty.js`
- `desktop/assets/app.terminals-input.test.mjs`
- Electron preload/main bridge code that exposes `window.vibyraDesktopClipboard`

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` says terminal selection copy is owned by
  `app.terminals-pty-runtime.js` and must use xterm selection, highlighted DOM
  fallback, capture-phase copy handling, and the Electron clipboard bridge.
- `.agents/skills/vibyra-ai-terminal-diagnostics/SKILL.md` repeats this as a
  diagnostic requirement.

Likely diagnostic path:

- Confirm whether selection exists in xterm's `getSelection()`.
- Confirm whether the capture-phase `copy`/keyboard handlers fire on Windows.
- Confirm whether `window.vibyraDesktopClipboard.writeText` exists in the
  Windows Electron renderer.
- Verify that terminal focus handling does not route Ctrl+C to PTY interrupt
  before checking selected text.

## Bug 4 - Cannot Open Links From Terminals

Observed:

- User cannot open links from terminal output.

Expected behavior:

- URLs and terminal-emitted OSC-8 hyperlinks should be clickable or otherwise
  open through the desktop shell.
- On Windows, link opening should use the Electron/browser-safe external open
  path, not rely on Linux-specific `xdg-open` behavior.

First files to inspect:

- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-editor-links.js` or whichever module defines
  `attachTerminalEditorLinkProvider`
- `desktop/lib/aiTerminalVibyraAgentPresentation.mjs`
- Electron preload/main bridge code for external URL opening

Existing contract:

- `aiTerminalVibyraAgentPresentation.mjs` renders terminal-safe OSC-8
  hyperlinks for Vibyra Agent output.
- `app.terminals-pty-runtime.js` attempts to attach a terminal editor/link
  provider when xterm is mounted.

Likely diagnostic path:

- Confirm whether the link provider module is loaded in `desktop/app.html` on
  Windows.
- Confirm whether `attachTerminalEditorLinkProvider(id, xterm)` runs for new
  xterm instances.
- Test plain `https://...` URLs and OSC-8 links separately.
- Confirm the Electron external-open bridge exists and is allowed in the
  renderer context.

## Bug 5 - Terminal Typing Spams Or Glitches

Observed:

- Typing inside AI terminals is buggy.
- User reports key typing can spam, duplicate, or glitch while entering text in
  terminal panes.

Expected behavior:

- Each physical keypress should be forwarded to the PTY exactly once.
- When xterm is available, only `xterm.onData` should forward typed bytes.
- Outer wrapper keydown and paste handlers should be fallback-only for
  environments without xterm and must become inert once xterm is mounted.
- Replayed persisted terminal output must not be mistaken for live keyboard
  input.

First files to inspect:

- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-pty.js`
- `desktop/assets/app.terminals-input.test.mjs`
- `desktop/lib/ptyTerminals.mjs`
- `desktop/lib/aiTerminalWorker.mjs`

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` says keyboard and paste input must have
  exactly one browser event owner.
- The same note records that attaching a bubbling `keydown` listener to the
  outer `[data-terminal-input]` host while xterm is active causes every
  physical keypress to be sent twice.
- During transcript replay, `onData` forwarding must be suppressed so terminal
  control-sequence responses are not misclassified as keyboard input.

Likely diagnostic path:

- Reproduce in a Windows desktop terminal by typing a short known string and
  comparing the visible transcript with the `/input` requests sent to the
  bridge.
- Check whether both xterm `onData` and an outer keydown/paste fallback fire
  for the same keypress.
- Check whether state refresh or terminal remounting binds duplicate input
  handlers.
- Verify replay suppression around persisted transcript writes.
- Run or extend `desktop/assets/app.terminals-input.test.mjs` to cover the
  Windows Electron path.

## Bug 6 - F8 Voice Toggle Does Not Stop Listening

Observed:

- Pressing F8 starts talking to the AI for spoken input/transcription.
- Pressing F8 again does not stop voice capture.
- The user must click the voice UI manually to stop it.

Expected behavior:

- F8 should work as a true voice toggle: first press starts listening, second
  press stops/cancels or submits the current voice capture according to the
  same behavior as the visible Talk control.
- The keyboard shortcut and manual click path should call the same state
  transition so they cannot diverge.
- Stopping from the hotkey must stop all acquired microphone tracks and leave
  the Talk UI in the same state as manual stop.

First files to inspect:

- `desktop/assets/app.terminals-companion-voice.js`
- `desktop/assets/app.terminals-companion-voice-utils.js`
- `desktop/assets/app.terminals-companion-runtime.js`
- `desktop/assets/app.terminals-companion.js`
- Electron global shortcut or renderer keyboard binding code that owns F8

Existing contract:

- `Vibyra/_ai/Desktop/Voice And Project Memory.md` says Electron Voice records
  microphone audio with `MediaRecorder`, and every recorder failure and
  cancellation path must stop all acquired microphone tracks.
- The same note says Voice/Talk is controlled by one state-driven primary
  control and that state changes must be consistent across listening,
  processing, playback, cancellation, panel close, tab/project switch,
  navigation, and page hide.

Likely diagnostic path:

- Reproduce on Windows by pressing F8 once to start listening, then F8 again
  while the Talk UI shows active capture.
- Compare the event path for F8 start with the manual stop button path.
- Confirm whether the second F8 is ignored because focus remains inside xterm,
  the shortcut handler is start-only, or the current voice state is not visible
  to the global shortcut handler.
- Confirm the active `MediaRecorder` and all stream tracks are stopped after
  the second F8.
- Add regression coverage for the shared start/stop toggle handler if the
  current tests only cover click behavior.

## Bug 7 - Spacebar Sometimes Does Not Insert Spaces

Observed:

- While typing in AI terminals, pressing Space sometimes does not add a space
  to the terminal input.
- The user experiences this as intermittent missing spaces while composing
  terminal prompts or commands.

Expected behavior:

- Spacebar input should be forwarded to the active xterm/PTY exactly once
  whenever terminal focus is inside a mounted terminal.
- Browser shortcut handlers, page-level key handlers, focus controls, and
  companion-panel controls must not intercept Space when the active target is
  terminal input.
- Space should not be treated as a click/activation shortcut for focused
  terminal wrapper buttons or shell controls while xterm owns input.

First files to inspect:

- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-pty.js`
- `desktop/assets/app.terminals-controls.js`
- `desktop/assets/app.terminals-input.test.mjs`
- Any desktop shell or Electron keybinding layer that handles Space or global
  terminal shortcuts.

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` says keyboard and paste input must have
  exactly one browser event owner and wrapper keydown fallback must be inert
  when xterm is active.
- The terminal copy/input contract requires selected-text copy and Ctrl+C
  interrupt behavior without stealing ordinary character input.

Likely diagnostic path:

- Reproduce on Windows by typing a sentence with frequent spaces in an active
  mounted xterm and checking whether the PTY receives `0x20` bytes.
- Compare behavior when focus is inside the xterm textarea, on the terminal
  wrapper, in grid vs focus mode, and after opening/closing companion panels.
- Check whether any `keydown` handler calls `preventDefault()` for Space before
  xterm receives it.
- Check whether remount/state-refresh timing loses xterm focus between words.
- Add a regression to `desktop/assets/app.terminals-input.test.mjs` proving
  Space is forwarded once and not swallowed by wrapper controls.

## Bug 8 - OpenRouter Model Catalog Is Missing Latest Models

Observed:

- The desktop terminal model picker is not showing the latest models available
  through OpenRouter.
- User specifically reports missing newly available Anthropic models, with
  "new fabel 5" given as an example to investigate/verify.

Expected behavior:

- The desktop model picker should refresh from the current OpenRouter catalog
  and include newly available terminal-capable models once the backend can
  price, authorize, and route them safely.
- Anthropic model entries should stay in sync across the OpenRouter catalog,
  desktop picker grouping, backend pricing/tier calculation, terminal gateway
  grants, and native Claude/Vibyra-token runtime ownership.
- Missing or incomplete pricing/tool metadata should fail closed for launch,
  but it should be visible enough during diagnostics to explain why a model is
  hidden or unavailable.

First files to inspect:

- `desktop/lib/openRouterModels.mjs`
- `desktop/assets/app.terminals-models.js`
- `desktop/lib/aiTerminalRuntimeCatalog.mjs`
- `desktop/lib/terminalGatewayAuth.mjs`
- `backend/app/Services/OpenRouterPricingCatalog.php`
- `backend/app/Services/CreditCalculator.php`

Existing contract:

- `Vibyra/_ai/Desktop/AI Terminals.md` says the OpenRouter catalog normalizer
  copies each model's `supported_parameters` into `supportsReasoning` and that
  terminal catalog entries must explicitly advertise tool support.
- The same note says the desktop picker and backend billing tier thresholds
  must agree, and dynamic terminal models should self-heal with an on-demand
  catalog refresh when the cache is empty, stale, or missing the selected slug.
- `.agents/skills/vibyra-ai-terminal-diagnostics/SKILL.md` says catalog models
  that do not advertise tool support must be rejected for terminal launch.

Likely diagnostic path:

- Verify the exact missing OpenRouter slug(s), especially the Anthropic model
  name the user intended by "new fabel 5".
- Compare OpenRouter's live catalog response with the desktop picker payload.
- Check whether the model is absent because the local cache is stale, because
  the frontend filters it out, because `supported_parameters` lacks required
  tool metadata, or because backend pricing/tier calculation rejects it.
- Confirm whether manual cache refresh/on-demand self-healing updates the
  desktop picker and backend pricing catalog consistently.
- Add a regression that a newly discovered terminal-capable Anthropic model
  appears in the picker with matching backend tier/pricing and launch grant
  constraints.

## Priority And Acceptance

Priority: high. These issues affect the core Windows desktop terminal workflow
before any model-routing or agent-quality validation can be trusted.

Acceptance for a future fix:

- A new Full-access GPT/Codex terminal can perform an action without an
  approval prompt and its process args prove bypass mode is active.
- Launching multiple fresh terminals does not repeat the same update prompt
  after it has already been handled or suppressed by Vibyra-owned startup
  state.
- Selecting terminal output and pressing Ctrl+C / Ctrl+Shift+C places the
  selected text on the Windows clipboard.
- Clicking or otherwise activating terminal URLs opens them externally from
  the Windows desktop app.
- Typing a character or paste payload into a mounted xterm sends it to the PTY
  once, without duplicated characters, spammed slash/input bytes, or glitchy
  repeated browser fallback events.
- Pressing F8 once starts Talk voice capture, and pressing F8 again stops it
  through the same state path as the manual Talk control, including microphone
  track cleanup.
- Typing text with spaces in a mounted terminal preserves every intended space
  and forwards each Space keypress to the PTY exactly once.
- The desktop terminal model picker and backend pricing catalog can refresh to
  include current OpenRouter terminal-capable models, including newly available
  Anthropic entries, without mismatched frontend/backend tier behavior.
- Existing regression coverage in `desktop/assets/app.terminals-input.test.mjs`
  remains passing, and future link/copy tests should cover the Windows Electron
  bridge path.
