# Desktop - Shell

Read this for the Vibyra Desktop (`desktop-tauri/`) shell surfaces: the auth
gate, chrome, and settings integrations.

## Auth Gate

`AuthBackdrop.tsx` always mounts the 125 KB WebP poster, but may mount the real
media only when `authVideoPolicy.ts` says the visible email surface is signup.
Login, provider, recovery, restore, connection-error, and authorization states
must have no `<video>` element. Reduced motion and maximum-performance mode also
keep the poster-only path and avoid loading the lazy media chunk.

The loop is the silent 1280x720/24fps VP8 `auth-space-loop.webm`, inlined as a
`data:` URI inside lazy `AuthBackdropVideo.tsx`. Keep both `?inline` and the lazy
boundary: custom-protocol/Blob delivery is unreliable for production media
range reads, while eager inlining puts the media payload on the startup path.
The previous H.264 MP4 returned `MEDIA_ERR_SRC_NOT_SUPPORTED` in the packaged
Linux WebKit/GStreamer runtime even though source tests passed.

Lifecycle containment is strict. A hidden window pauses playback. Leaving
signup synchronously unmounts the media component; its layout-effect cleanup
must call `pause()`, remove `src`, then `load()` so GStreamer cannot keep
decoding behind the terminal workspace. Native packaged verification must show
an advancing, unpaused clock on visible signup and zero video elements plus the
three teardown calls on login and three seconds later. Regression coverage is
in `desktop-tauri/tests/authBackground.test.mjs`.

Email signup/login continue through native account commands to backend
`/api/auth/signup|login`; password recovery is shown only for login.

## Rust/Tauri Settings Integrations

The new native app's service settings live in `desktop-tauri/src/components/settings/SettingsModal.tsx` and `SettingsIntegrationsPane.tsx`, with focused styling in `desktop-tauri/src/styles/settings-integrations.css`. The rail label is `Integrations`, not `AI & Models`. Keep this page flat and account-oriented: OpenAI/ChatGPT, Anthropic/Claude, and Google/Gemini connect through official CLI browser authorization, never API-key inputs. `provider_auth*.rs` owns status probes, secret-stripped login processes, cancel/disconnect, Gemini OAuth preparation, and a native-only captured sign-in URL fallback; the renderer receives only safe account status and whether `Open sign-in page` is available. Connected account runtimes synchronize with `Settings.enabledAgentIds`, while non-account CLIs remain independent under `Additional runtimes`. OpenRouter is a separate automatic public-catalog row, not a connected billing account. Model choice belongs to terminal launch flows. Existing deployment-owned Chat/Voice credentials remain native-only and are not terminal account authorization.

Discord model-release promotion and its secret do not belong in Settings or
persisted `Settings`. `model_watch_discord.rs` uses
`VIBYRA_DISCORD_WEBHOOK_URL` as a runtime override, then falls back to the OS
credential store. On Linux, `npm run discord:configure` accepts the URL through
a hidden prompt, sends a real test notification, and saves it only after
Discord confirms success. The first successful OpenRouter fetch still seeds
the roster silently.

## Shell Chrome Consistency (2026-08-22)

`src/styles/tokens.css` now owns the type scale (`--fs-micro` 9px through
`--fs-title` 15px), a six-step weight ladder (`--fw-regular`..`--fw-black`),
`--strip-w`, and `--subhead-h`. Every `font-size` in desktop CSS sits on that
scale; do not reintroduce intermediate values (11.75, 12.25) or sub-9px text.

`--subhead-h` (46px) is the shared height of every second-row header. The
workspace mode bar and the companion head must both resolve to it *including*
their bottom hairline — they were 46px and 45px, so their seams missed by 1px.
`.chrome__brand` is `--strip-w + --rail-w` wide so the titlebar's first column
ends on the rail's right edge.

`src/styles/nav-segmented.css` is the sole owner of the segmented switch shape
shared by `.project-modes` (Terminals/Preview) and `.companion__tabs`
(Chat/Memory/Files). The companion previously used underline tabs, so two
idioms sat side by side on the same row. Per-surface fit stays in the consuming
sheet, which must load after it.

`companion.css` was folded into `companion-shell.css`: the dock now has one
owner for frame, resize edge, header and body. `.agent-row` likewise has one
owner (`settings-agents.css`); `rail.css` no longer defines it, and
`.agent-row__custom-tag` moved to `agent-picker-models.css` with its consumer.

`.btn--secondary` and `.btn--danger` are defined in `base-controls.css`. They
were used in Settings > Integrations and the agent picker but had never been
written, so a destructive "Disconnect" rendered identically to "Keep". Boolean
settings rows use `Switch` from `SettingsShared.tsx`, never a `.btn` with
`role="switch"`.

Live notification toasts expose a compact settings gear beside Dismiss.
`Toasts.tsx` dismisses only the clicked toast, closes the notification centre,
and routes through `workspaceStore.openSettingsSection("notifications")`; the
notification-centre header uses the same destination through
`NotificationBellHost.tsx`. Keep this shortcut renderer-only.

Verify shell/CSS work with the desktop gates (`npm run lines`, `typecheck`,
`test`, `build`, `check:dead-code`) plus a rendered check of both themes — the
`color-mix` used by the danger/secondary buttons must hold on the light ground.

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
