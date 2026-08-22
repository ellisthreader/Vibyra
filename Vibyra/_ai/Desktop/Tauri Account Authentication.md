# Tauri Account Authentication

Implemented 2026-08-18 from "Vibyra Account Authentication Plan.txt". This note is the durable map; read it before touching account/auth code in `desktop-tauri/`.

## Architecture

React auth UI → safe Tauri IPC commands only → native `AccountSessionManager` → Laravel API + OS credential store + system browser. The bearer token, OAuth URL, and flow id never reach the renderer; React only sees `AccountSnapshot { status, profile, error, pendingProvider, secureStorage }`.

## Rust modules (`desktop-tauri/src-tauri/src/`)

- `account_types.rs` — renderer-safe `AccountProfile`/`AccountSnapshot`/`AccountStatus` + `profile_from_user` (whitelists name/email/provider/plan/emailVerified from the backend `user` payload).
- `account_api.rs` — enumerated `Endpoint` enum (renderer can never supply paths/methods), `base_url()` (prod `https://vibyra-production.up.railway.app`, dev override env `VIBYRA_DESKTOP_API_URL` restricted to loopback/https), 30 s timeout + one retry for Railway cold starts, `ApiError::{Unauthorized, Rejected, Network}` — only `Unauthorized` may discard a stored session.
- `account_session.rs` — `AccountSessionManager` in `AppState.account`; token in memory + keyring entry `com.vibyra.desktop`/`vibyra-account-session` (see `secret_store.rs`). Keyring write happens before the in-memory swap. OAuth cancellation via replaceable `Arc<AtomicBool>`.
- `account_auth.rs` — restore (verify via `/api/session`, clear only on 401/403, `ConnectionError` state otherwise), email login/signup, logout (revoke → kill+remove all PTY sessions → clear keyring). Rotation after each verified restore, skipped when the credential store is unavailable (would strand the persisted token after the 120 s grace window).
- `account_profile.rs` — profile refresh/update, password forgot, verification resend.
- `account_oauth.rs` — `/api/auth/desktop/{provider}/start` → open system browser (`provider_auth_url::open`) → 1 s poll of the **one-shot** status endpoint (first non-pending response consumes the result; a second poll gets HTTP 410). On complete: re-verify token via `/api/session` before persisting. Emits `account:changed` with a snapshot.
- `account_device.rs` — stable 64-hex `installation-id` file beside settings.json (0600), truthful device label `host · Vibyra Desktop (OS)`. Sent as `installId`/`deviceName` on signup/login/OAuth start — required for backend device grouping.
- `commands/account.rs` — 12 thin commands incl. `account_open_legal` (enumerated privacy/terms pages only).

## Frontend (`desktop-tauri/src/`)

- Gate: `App.tsx` renders `components/auth/AuthScreen` until `accountStore` status is `signedIn`, then mounts `components/layout/WorkspaceApp` (the former App body); its mount effect runs `startAppRuntime`, which is how "restore before any workspace init" is enforced. Any signedIn→signedOut transition triggers `window.location.reload()` so no account-scoped renderer state survives (this is also how logout clears state).
- `state/accountStore.ts` (zustand) + `ipc/account.ts` + pure `lib/accountPolicy.ts` (tested in `tests/accountPolicy.test.mjs`).
- Auth surface: `auth/AuthScreen|AuthProviders|AuthEmailForm|authMarks` with `styles/auth*.css` — **always dark, colors hard-coded** (tokens would flip under `data-theme="light"`). Backdrop `assets/front-auth-desktop-4k.webp`, mark `assets/vibyra-cobalt.png`.
- Title bar: gear replaced by `layout/AccountMenu` (avatar initial, sparse menu, inline logout confirm when terminals are running). Window controls/resize handles extracted to `layout/WindowChrome.tsx` (shared with AuthScreen).
- Settings: `profile` is the first `SettingsSectionId`; `SettingsProfilePane` (provider-managed email rule, verify resend, reset link, logout). `lib/useModalFocus.ts` gives SettingsModal focus trap + inert background + focus restore.

## Contract gotchas (from `backend/routes/web.php` + controllers)

- Errors are `{ok:false, error:"…"}`; 429 uses `message`. No Laravel validation-errors map.
- `emailVerified` bool; `passwordConfirmation` camelCase; OAuth start returns `flowId`/`authUrl`/`expiresIn`.
- Provider accounts may not change email (`Change the email through your sign-in provider.`, 422).
- Email resend is always HTTP 200 — branch on `retryAfter`, not status.
- Rotation 409 = another install rotated first; keep the current token, do not log out.

## QA

Local mock of the contract: `/tmp/vibyra-mock-api.py` pattern (run app with `VIBYRA_DESKTOP_API_URL=http://127.0.0.1:8899`). Live provider flows still need real Google/Apple env config (see plan's Backend and Release Configuration section) — not testable against the mock.
