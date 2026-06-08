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
Voice and Memory also have persistent labeled launchers beside the terminal tabs
so users do not need to discover slash commands first. Keep those launchers
visible on the empty terminal setup screen, show the active panel state, and
collapse labels to icons only at narrow phone-sized desktop widths.
The mounted frame is labeled `Vibyra AI`, renders only the active tool, and
stays in the right grid column through Electron's `860px` minimum width. Memory
uses the wider panel variant; Voice stays compact. Terminal/project switches
must synchronize the open tool without remounting xterm nodes, and a dirty
Memory document must flush before its terminal context changes.

Electron Voice records microphone audio with `MediaRecorder` and posts it to
`POST /desktop/voice/transcribe`. The bridge uses the connected OpenAI
credential with `gpt-4o-mini-transcribe`. Browser-only shells may use Web Speech
recognition, but Electron must not rely on it because its network-backed speech
service is unreliable. Electron media permission is audio-only and restricted
to the local desktop origin. Every recorder failure and cancellation path must
stop all acquired microphone tracks, including tab/project switches, panel
close, navigation, and page hide.

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
Voice history is private per terminal and bounded to four turns; it never enters
visible terminal Chat or PTY input. That same history renders below the primary
control as a compact transcript with `You` and `Vibyra` rows, styled by
`desktop/assets/app.terminals-companion-voice-conversation.css`. Do not maintain
a duplicate transcript store or add clear/edit/send controls. The user turn
appears after transcription and the assistant turn appears before spoken
playback. Do not show a `Preparing voice` phase. Structured actions still run
through `runDesktopActions`, so
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
Expose one `Import` action that selects an Obsidian vault or Markdown folder;
do not show AI generation, starter-vault creation, vault discovery, or separate
file/folder import choices. Drag-and-drop may remain as an unobtrusive fallback.
Vault imports remain Markdown-only and continue to ignore hidden metadata.

The empty vault owns the whole Memory content area: do not show the explorer,
editor toolbar, or footer before setup. A populated vault opens in Graph view.
The graph is derived from real folder parent/child relationships and Markdown
`[[wikilinks]]`; unlinked root notes remain separate. Clicking a document node
opens it in Notes view, and the toolbar provides explicit Graph/Notes switching.
Keep the graph panel background flat and aligned with the companion surface;
do not add a full-panel radial accent glow, SVG blur filters, radial node
gradients, or filled cluster halos behind Memory.
Large vaults use the deterministic force layout in
`app.terminals-memory-graph-layout.js`, with a 1000x720 virtual canvas, visible
folder/high-degree labels, bounded 55%-320% wheel/button zoom, Fit reset, and
drag-to-pan. Do not return to fixed radial placement that collapses dense
imports into a narrow column. The advanced visual layer adds real folder-region
halos, cluster colors, hub orbits, curved Markdown links, a structural legend,
and hover neighborhood isolation; these remain derived from vault data rather
than decorative fake connections.

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
In Electron, hide/disable the fallback folder input and remove it from pointer
hit-testing; a disabled full-row overlay input will swallow real mouse clicks
before the label's native-picker handler runs.

Memory surfaces expose no AI-generation controls. Keep import as the sole
vault-ingestion action in compact, fullscreen, and empty-vault views. The
legacy proposal backend may remain for compatibility, but it must not be loaded
or linked from the desktop Memory frontend.
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
