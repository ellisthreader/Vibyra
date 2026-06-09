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
reaches provider CLIs. The terminal toolbar has one labeled `Vibyra AI`
launcher. `/voice` and `/memory` open the same right sidebar: AI Voice is the
native prompt input at the top and project Memory remains visible below it.
The companion exists only while open, preserves mounted xterm nodes, refits
xterm after width changes, and uses one close action. Keep the launcher on the
empty terminal setup screen, show its active state, and collapse its label only
when the title bar is genuinely narrow.

Voice transcription is inserted into the active terminal prompt and the user
explicitly sends it to the active agent. The mounted sidebar stays in the right
grid column through Electron's `860px` minimum width. Terminal/project switches
must synchronize both tools without remounting xterm nodes, and a dirty Memory
document must flush before its terminal context changes.

Electron Voice records microphone audio with `MediaRecorder` and posts it to
`POST /desktop/voice/transcribe`. The bridge uses the connected OpenAI
credential with `gpt-4o-mini-transcribe`. Browser-only shells may use Web Speech
recognition, but Electron must not rely on it because its network-backed speech
service is unreliable. Electron media permission is audio-only and restricted
to the local desktop origin. Every recorder failure and cancellation path must
stop all acquired microphone tracks, including tab/project switches, panel
close, navigation, and page hide.

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

`sendDesktopChat()` fetches canonical memory for the selected project and adds
the latest six user entries to the prompt. This covers desktop chat and the
Vibyra PTY wrapper because both use `/desktop/chat`. Native Codex, Claude, and
Gemini CLI processes do not automatically receive Vibyra Memory.

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
