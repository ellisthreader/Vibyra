# Desktop - Voice And Project Memory

Read this for the AI-terminal companion panel, `/voice`, `/memory`, microphone
permissions, transcription, and editable project memory.

## Main Files

- `desktop/assets/app.terminals-companion.js`
- `desktop/assets/app.terminals-companion-voice.js`
- `desktop/assets/app.terminals-companion-memory.js`
- `desktop/lib/desktopVoice.mjs`
- `desktop/lib/desktopProjectMemory.mjs`
- `desktop/lib/desktopChat.mjs`
- `backend/app/Http/Controllers/Concerns/ProjectMemoryEndpoints.php`

## Contracts

`/voice`, `/memory`, `/memories`, and `/phone` are intercepted before PTY input
reaches provider CLIs. Companion panels exist only while open, preserve mounted
xterm nodes, refit xterm after width changes, and use a shared close action.

Electron Voice records microphone audio with `MediaRecorder` and posts it to
`POST /desktop/voice/transcribe`. The bridge uses the connected OpenAI
credential with `gpt-4o-mini-transcribe`. Browser-only shells may use Web Speech
recognition, but Electron must not rely on it because its network-backed speech
service is unreliable. Electron media permission is audio-only and restricted
to the local desktop origin.

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

`sendDesktopChat()` fetches canonical memory for the selected project and adds
the latest six user entries to the prompt. This covers desktop chat and the
Vibyra PTY wrapper because both use `/desktop/chat`. Native Codex, Claude, and
Gemini CLI processes do not automatically receive Vibyra Memory.

Backend chat-learning memory remains separate hidden quality data. Do not expose
it as editable project memory.

## Validation

- `node --test desktop/lib/desktopChat.test.mjs desktop/lib/desktopProjectMemory.test.mjs desktop/lib/desktopVoice.test.mjs desktop/lib/desktopUiAuth.test.mjs`
- `php artisan test --filter=ProjectMemoryApiTest` from `backend/`
- Syntax-check changed browser scripts with `node --check`.
- Smoke-test microphone allow/deny, terminal switching while recording, panel
  close/navigation cleanup, xterm resize, project isolation, and OpenAI account
  missing/error states in Electron.

## Fresh Setup

From the repository root, `npm run desktop:setup` installs Node and Composer
dependencies, prepares SQLite, runs Laravel migrations, starts the backend, and
launches Vibyra Desktop. Keep this as the single documented desktop setup path.
