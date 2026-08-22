# Desktop - Shell

Read this for the Vibyra Desktop (`desktop-tauri/`) shell surfaces: the auth
gate, chrome, and settings integrations.

## Auth Gate

The auth surface uses
`desktop-tauri/src/components/auth/AuthBackdrop.tsx` with the bundled silent
H.264 `auth-space-loop.mp4` and its matching first-frame WebP poster. The poster
stays mounted beneath the video; playback fades in only after `playing`, and
reduced-motion or decoder failure remains static. Replacement videos must be
circularly crossfaded before export, use broadly compatible `yuv420p`, contain
no audio, and avoid an additional CSS drift animation. On Linux production
builds, import the MP4 with Vite's `?inline` query and allow `data:` in the
Tauri `media-src`; custom-protocol and Blob delivery can stall or corrupt media
range reads in WebKit/GStreamer even when dev playback works. Confirm playback
with two time-separated native captures, not markup alone. Regression coverage
is in `desktop-tauri/tests/authBackground.test.mjs`. Email signup/login continue
through native account commands to backend `/api/auth/signup|login`; the
backend lifecycle test verifies user/session persistence, logout revocation,
and a fresh login in isolated SQLite. Switching between provider, login,
signup, and recovery paths clears stale backend errors; password recovery is
shown only for login, never while creating an account.

## Rust/Tauri Settings Integrations

The new native app's service settings live in `desktop-tauri/src/components/settings/SettingsModal.tsx` and `SettingsIntegrationsPane.tsx`, with focused styling in `desktop-tauri/src/styles/settings-integrations.css`. The rail label is `Integrations`, not `AI & Models`. Keep this page flat and account-oriented: OpenAI/ChatGPT, Anthropic/Claude, and Google/Gemini connect through official CLI browser authorization, never API-key inputs. `provider_auth*.rs` owns status probes, secret-stripped login processes, cancel/disconnect, Gemini OAuth preparation, and a native-only captured sign-in URL fallback; the renderer receives only safe account status and whether `Open sign-in page` is available. Connected account runtimes synchronize with `Settings.enabledAgentIds`, while non-account CLIs remain independent under `Additional runtimes`. OpenRouter is a separate automatic public-catalog row, not a connected billing account. Model choice belongs to terminal launch flows. Existing deployment-owned Chat/Voice credentials remain native-only and are not terminal account authorization.

Discord model-release promotion and its secret do not belong in Settings or
persisted `Settings`. `model_watch_discord.rs` uses
`VIBYRA_DISCORD_WEBHOOK_URL` as a runtime override, then falls back to the OS
credential store. On Linux, `npm run discord:configure` accepts the URL through
a hidden prompt, sends a real test notification, and saves it only after
Discord confirms success. The first successful OpenRouter fetch still seeds
the roster silently.

## Settings Simplification Direction

The 2026-08-21 audit keeps five primary destinations (General, AI accounts,
Notifications, Shortcuts, Account) and moves expert controls behind a secondary
Advanced destination. Preserve native provider/key ownership, spend guards,
permission prompts, privacy consequences, confirmations, and existing persisted
fields while removing repeated copy from the default path. The implementation
sequence, item mapping, file ownership, and acceptance criteria are in
[[Settings Simplification Plan]]. This is a planned navigation-label change;
the shipped surface remains `Integrations` until that plan is approved and
implemented.

The watcher covers OpenRouter models that advertise tool support, not every
model release globally. Later additions are written to the `model-watch.json`
pending queue before delivery; only a successful Discord HTTP status clears
them, so missing, rejected, or temporarily unreachable webhooks retry on later
ticks without repeating the in-app release event. Tests cover legacy-store
loading, base-model deduplication, pending persistence, Discord URL validation,
and success/rejection responses through a local HTTP server. Validate with the
frontend tests/build, the desktop line gate, and Cargo using the toolchain
pinned in `desktop-tauri/rust-toolchain.toml` (currently 1.97.1).
