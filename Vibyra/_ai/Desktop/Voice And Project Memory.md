# Desktop - Voice And Project Memory

Read this for the AI-terminal companion panel, `/voice`, `/memory`, microphone
permissions, transcription, and editable project memory.

## Main Files

- `desktop/assets/app.terminals-companion.js`
- `desktop/assets/app.terminals-companion-runtime.js`
- `desktop/assets/app.terminals-companion-voice.js`
- `desktop/assets/app.terminals-companion-voice-utils.js`
- `desktop/assets/app.terminals-companion-memory.js`
- `desktop/assets/app.terminals-memory-*.js`
- `desktop/lib/desktopMemoryRoutes.mjs`
- `desktop/lib/desktopMemoryVault.mjs`
- `desktop/lib/desktopVoice.mjs`
- `desktop/lib/desktopProjectMemory.mjs`
- `desktop/lib/desktopChat.mjs`
- `backend/app/Http/Controllers/Concerns/ProjectMemoryEndpoints.php`
- `backend/app/Services/ProjectMemory/`

## Contracts

`/voice`, `/memory`, `/memories`, and `/phone` are intercepted before PTY input
reaches provider CLIs. Companion panels exist only while open, preserve mounted
xterm nodes, refit xterm after width changes, and use a shared close action.
The terminal shell exposes one sidebar launcher, then Editor / Preview / AI /
Memory inside the right workspace. Talk lives inside AI's Chat / Talk switcher;
it has no separate terminal-tab launcher or companion mode. `/voice` and
`Alt+V` open AI directly in Talk state. Terminal/project switches must
synchronize the open tool without remounting xterm nodes, and a dirty Memory
document must flush before its terminal context changes.

Electron Voice records microphone audio with `MediaRecorder` and posts it to
`POST /desktop/voice/transcribe`. The bridge uses the connected OpenAI
credential with `gpt-4o-mini-transcribe`. Browser-only shells may use Web Speech
recognition, but Electron must not rely on it because its network-backed speech
service is unreliable. Electron media permission is audio-only and restricted
to the local desktop origin. Every recorder failure and cancellation path must
stop all acquired microphone tracks, including tab/project switches, panel
close, navigation, and page hide.
OpenAI credential discovery is owned by `desktop/lib/providerAccounts.mjs`.
Personal provider-account and terminal routing uses only the private provider
store. Voice uses the separate `openAiVoiceCredential()` resolver: it prefers
that stored account, then reads `OPENAI_API_KEY` from `process.env` and the same
ignored root/backend `.env` paths used by desktop agent configuration. This
lets Voice use local env configuration without treating a repository key as a
connected personal AI account or copying it into source. A bridge restart is
required after changing bridge code, but env-file values are read at request
time.

Voice is a Vibyra AI conversation, not terminal dictation. Its upper-half UI is
one talk/stop button with `Alt+V`; after transcription it sends the spoken turn
directly through `requestDesktopChat` with the active terminal project, model,
reasoning, profile preferences, and a voice-specific concise-response style.
The same primary control communicates the full turn state: idle says Vibyra is
not listening, listening uses red `MIC LIVE` copy and animated level bars,
processing explicitly says listening is paused, and playback uses purple
`VIBYRA LIVE` speaking feedback. Never describe the
physical microphone as off when only Vibyra capture is idle. State changes
also use assertive accessible announcements and reduced-motion fallbacks.
Voice-specific visuals live in
`desktop/assets/app.terminals-companion-voice.css`.
Talk renders as one continuous push-to-talk conversation: one state-driven
concentric voice field, one compact live-status row, a transcript that fills
the remaining height, and a quiet AI-voice disclosure. The transcript is flat
against the Talk canvas with no surrounding background, border, radius, or
header divider; keep the `Conversation` label, right-align `You`, and left-align
`Vibyra`. Phase color/motion may change for listening, processing, speaking,
and errors, but the UI must not add more controls or repeat raw runtime labels
such as `Listening` and `Speaking` when the visible phase already communicates
them.
Voice history is private per terminal and bounded to four turns; it never enters
visible terminal Chat or PTY input. That same history renders below the primary
control as a compact transcript with `You` and `Vibyra` rows, styled by
`desktop/assets/app.terminals-companion-voice-conversation.css`. Do not maintain
a duplicate transcript store or add clear/edit/send controls. The user turn
appears after transcription and the assistant turn appears before spoken
playback. Bind the assistant row to the initiating user-message object so both
halves remain in the same thread if an action transfers the conversation from
`setup` to a newly created or activated terminal. Do not show a `Preparing
voice` phase. Structured actions still run through `runDesktopActions`, so
existing confirmation dialogs remain authoritative and the action summary is
spoken. Before any terminal exists, Voice uses the same `setup` context as
terminal Chat so spoken launch commands can create the first terminal. A voice
action that creates or activates a terminal must transfer its target to that
terminal without invalidating the in-flight request or spoken confirmation.
Replies use binary audio from `POST /desktop/voice/speak`, with system
speech synthesis as the fallback, and the UI keeps an `AI-generated voice`
disclosure visible. New recording, panel/page/context changes,
and page hide stop capture/playback, revoke audio URLs, and invalidate stale
requests. Keep explicit push-to-talk; do not add automatic listening, separate
Enter, clear-transcript, terminal target, or manual-send controls.

Terminal dictation is separate from Talk. `F8` starts or stops a
global recording for the terminal selected when capture begins. The renderer
posts that audio to the same `/desktop/voice/transcribe` route, then sends the
text through `terminalCompanionInsertIntoTerminal(targetId, text, true)` so
native PTYs receive one bracketed paste followed by Enter. A transient
bottom-center pill names the captured terminal and shows starting, red
listening, transcribing, sent, and error states. It never opens AI, adds a
message to the Talk transcript, or retargets when focus changes.
`F8` is a renderer key listener, not an OS-global shortcut; it requires the
Vibyra window to have keyboard focus.

Desktop Settings > Preferences owns local Voice preferences. The built-in
selector mirrors the 13 voices accepted by `gpt-4o-mini-tts`: `alloy`, `ash`,
`ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`,
`verse`, `marin`, and `cedar`; default to `marin`. Speaking speed supports the
OpenAI Speech API range `0.25`-`4.0`, defaults to `1.0`, and also controls
system-speech fallback playback. The browser sends both values to
`POST /desktop/voice/speak`, while `desktop/lib/desktopVoice.mjs` validates
them independently before calling OpenAI. Start with
`desktop/assets/app.profile-voice.js`,
`desktop/assets/app.terminals-companion-voice-playback.js`, and
`desktop/lib/desktopVoice.mjs` for preference changes. Settings shows a short
sound-character description beside each voice name. Treat these descriptions
as concise listening guidance, not official OpenAI API metadata; OpenAI
publishes the voice names and recommends `marin` or `cedar` for best quality,
but does not publish a per-voice personality taxonomy.

Editable Memory uses the existing mobile `appState.projectMemories` shape:
eight project-scoped entries, 220 characters each, with `brief` entries locked
against deletion. Backend routes are:

- `GET /api/project-memory/{projectId}`
- `POST /api/project-memory/{projectId}/entries`
- `DELETE /api/project-memory/{projectId}/entries/{entryId}`

The desktop bridge proxies these under `/desktop/project-memory`. Mutations
lock and update only `app_state.projectMemories`, preserving unrelated cloud
state. `/api/session/state` merges project memories by `updatedAt` so stale
mobile snapshots do not overwrite newer desktop edits.

The terminal Memory workspace is an Obsidian-style project vault layered beside
that legacy projection. It has a folder/note explorer, search, Markdown
edit/preview, autosave with node versions, recursive folder confirmation, and
imports from selected `.md` files or an Obsidian directory picker. Browser
imports send only normalized relative paths and Markdown content; local
filesystem paths and `.obsidian` metadata never cross the bridge. Canonical
vault routes are `GET .../vault`, node `POST`/`PATCH`/`DELETE`, and
`POST .../imports`, proxied under `/desktop/project-memory`.

An empty project vault opens a focused import state instead of a blank editor.
Electron automatically discovers Obsidian vaults from the Obsidian registry and
uses a shallow bounded common-folder scan only when the registry has no usable
entries, then presents each result as a one-click
suggestion with an opaque ID, friendly location, and note count. Keep two clear
manual choices beneath suggestions: `Obsidian vault` preserves folder structure
and wikilinks, while `Markdown files` accepts individual `.md`, `.markdown`, or
`.txt` notes. The populated compact and fullscreen workspaces expose those same
two choices through one quiet `Import` menu. Do not show AI generation or
starter-vault creation. Drag-and-drop may remain as an unobtrusive fallback.
Vault imports remain Markdown-only and continue to ignore hidden metadata.

The empty vault owns the whole Memory content area: do not show the explorer,
editor toolbar, or footer before setup. A populated vault opens in Graph view.
The compact populated workspace has no persistent bottom status/footer; show
brief save/import status quietly in the toolbar so the graph or editor receives
all remaining vertical space. Narrow desktop layouts must keep the Memory
companion at `height: 100%` with no viewport-height cap; a legacy `60vh`
maximum creates a false empty region beneath both Graph and Notes.
The current companion renderer has exactly two flow children, its mode
navigation and `.terminal-companion-primary`, so
`.terminal-companion--memory` must use `auto minmax(0, 1fr)` rows. An extra
auto row or nested Notes `height: 100%` chain can displace or clip the document
header. Let the workbench, document, and editor stretch through grid tracks
with `min-height: 0`, and keep scrolling on the textarea/preview. Fullscreen
Memory is rendered inside `.terminal-companion-primary`; fullscreen CSS must
keep that element visible rather than targeting the removed legacy companion
stack.
The graph is derived from real folder parent/child relationships and Markdown
`[[wikilinks]]`; unlinked root notes remain separate. Clicking a document node
opens it in Notes view, and the toolbar provides explicit Graph/Notes switching.
Keep the graph panel background flat and aligned with the companion surface;
do not add a full-panel radial accent glow, SVG blur filters, radial node
gradients, or filled cluster halos behind Memory.
Large vaults use the deterministic force layout in
`app.terminals-memory-graph-layout.js`, with a 1000-wide virtual canvas whose
height follows the rendered graph aspect ratio, visible folder/high-degree
labels, bounded 55%-320% wheel/button zoom, Fit reset, and drag-to-pan. Tall
sidebars use a compact Graph section centered at 50% of the available content
height so relationships stay legible without a vertically stretched
appearance. Notes and fullscreen Graph continue to fill their content area. The
advanced visual layer adds real folder-region
halos, cluster colors, hub orbits, curved Markdown links, a structural legend,
and hover neighborhood isolation; these remain derived from vault data rather
than decorative fake connections. Keep `Project brain` in the graph's top
header. Keep the compact graph footer-free: place the small folder/link legend
beside the graph controls and let the canvas consume all remaining height.

The terminal companion has a persisted drag width owned by
`app.terminals-companion-layout.js`, clamped to 280px-720px while reserving at
least 420px for the terminal. The separator supports pointer drag plus keyboard
Arrow/Home/End adjustment, and width changes refit mounted xterms. Memory can
expand into a focused in-app workspace that fills the terminal canvas while
keeping PTY sessions mounted and running; Escape, close, or restore returns to
the saved split and refits xterm. Graph/Notes switching and imported node count
must never change the saved width automatically.
Expanded Memory is a dedicated Obsidian-style app shell rather than the compact
companion stretched across the page: keep a top tab/action bar, narrow tool
ribbon, real project-vault explorer on the left, Graph/Notes workspace in the
center, and a real-data Links panel on the right. Entering fullscreen expands
top-level vault folders so files are immediately discoverable. All visible
nodes, counts, links, and editor content must remain derived from the canonical
project vault; do not add decorative placeholder notes or relationships.
Document editing has no bottom `Insert into terminal` or large delete action;
deletion remains the contextual explorer-row trash action.

Vault GET requests use `cache: "no-store"`, and a forced reload requested while
another vault load is active must be queued rather than discarded. Import file
inputs are cleared immediately after consuming their `FileList`, so selecting
the same notes again still fires a change and the post-import graph reloads.
Electron Markdown import controls use the main-process native file dialog
through the preload `vibyraDesktopMemory.pick()` API; browser file inputs and
setup drag-and-drop remain fallbacks outside Electron. The picker implementation
is `desktop/lib/desktopMemoryPicker.cjs` and returns only normalized relative
paths and note text, never absolute local paths. Accept `.md`, `.markdown`, and
`.txt`, normalize the latter two to `.md`, preserve relative folder structure
for vault imports, and ignore Obsidian metadata and other generated folders.
Automatic discovery is owned by `desktop/lib/desktopObsidianDiscovery.cjs` and
the `discoverObsidian` / `importDiscoveredVault` preload APIs. Cache successful
renderer discovery results so project or terminal switches do not repeatedly
scan the filesystem. Keep the registry as the fast path; do not recursively
search large home-folder trees or fully traverse large vaults merely to display
suggestions.
In Electron, hide/disable the fallback folder input and remove it from pointer
hit-testing; a disabled full-row overlay input will swallow real mouse clicks
before the label's native-picker handler runs.

Memory surfaces expose no AI-generation controls. Keep discovered Obsidian,
manual Obsidian, and manual Markdown import as the only vault-ingestion paths in
compact, fullscreen, and empty-vault views. The legacy proposal backend may
remain for compatibility, but it must not be loaded or linked from the desktop
Memory frontend.
Do not expose New Note, New Folder, or item-creation keyboard controls. Files
and folder structure enter Memory through the single Import action; imported
notes remain editable.

`sendDesktopChat()` combines bounded imported-vault excerpts with the latest
project memory entries. This covers desktop chat and the Vibyra PTY wrapper
because both use `/desktop/chat`. Official Codex, Claude, and Gemini PTYs use a
bounded vault snapshot prepared by `desktopTerminalMemory.mjs` at terminal
launch and injected through private provider-specific context owned by the
detached terminal session; no Memory instruction file is written to the user
project. Reopen an official terminal to pick up later vault changes.

Backend chat-learning memory remains separate hidden quality data. Do not expose
it as editable project memory.

## Validation

- `node --test desktop/lib/desktopMemoryVault.test.mjs desktop/lib/desktopMemoryRoutes.test.mjs desktop/lib/desktopChat.test.mjs desktop/lib/desktopProjectMemory.test.mjs desktop/lib/desktopVoice.test.mjs desktop/lib/desktopUiAuth.test.mjs`
- `./vendor/bin/phpunit --filter 'ProjectMemory(Api|VaultApi)Test'` from `backend/`
- Syntax-check changed browser scripts with `node --check`.
- Smoke-test microphone allow/deny, terminal switching while recording, panel
  close/navigation cleanup, xterm resize, project isolation, and OpenAI account
  missing/error states in Electron.

## Fresh Setup

From the repository root, `npm run desktop:setup` installs Node and Composer
dependencies, prepares SQLite, runs Laravel migrations, starts the backend, and
launches Vibyra Desktop. Keep this as the single documented desktop setup path.
