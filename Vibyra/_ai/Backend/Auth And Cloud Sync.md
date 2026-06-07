# Backend - Auth And Cloud Sync

Read this for backend auth, app session state, and mobile cloud sync behavior.

## Files

- `backend/app/Http/Controllers/Concerns/SessionState.php`
- `backend/app/Http/Controllers/Concerns/ChatHistory.php`
- `backend/routes/web.php`
- `src/utils/appApi.ts`
- `src/context/useCloudSync.ts`
- `src/context/useAppState.ts`

## Auth

Bearer tokens are issued at login/signup. `authenticatedUser($request)` resolves the current user for protected routes.

App-session expiry should return the user to login without wiping local workspace/chat state. Keep this separate from desktop bearer-token expiry, which should only disconnect the paired PC. Account profile writes use `POST /api/account/profile`; destructive account deletion uses authenticated `DELETE /api/account` with `{ password }`, validates the password server-side, deletes the user, and relies on cascade cleanup for sessions and user-owned cloud data.

Account session management is backed by real `vibyra_sessions` rows. Session creation stores `deviceName`, optional `installId` as `device_identifier`, request IP, user agent, `created_at`, and `last_used_at`; authenticated requests refresh `last_used_at` plus request metadata. Required migrations include `2026_05_21_000002_add_device_metadata_to_vibyra_sessions_table.php` and `2026_05_21_000003_add_device_identifier_to_vibyra_sessions_table.php`; run `php artisan migrate --force` if login/signup reports a missing session metadata column. Routes: `GET /api/account/sessions` lists current-user `devices` grouped by `device_identifier` (legacy rows group by device name, user agent, and IP) and also returns raw `sessions` for compatibility. Device payloads include `current`, `location`, `createdAt`, `updatedAt`, and `sessionCount`, with the current device sorted first. `DELETE /api/account/devices/{deviceId}` revokes all sessions for one device; `DELETE /api/account/sessions/{sessionId}` revokes one raw session; `DELETE /api/account/sessions` revokes all sessions including the current token. Private, loopback, and reserved IPs are surfaced as `Local network`.

Public-IP account session locations use MaxMind GeoLite2 City locally through `App\Services\SessionLocationResolver`; it returns `City, Country` or country-only when available and caches labels for 7 days. Do not call a hosted geolocation API on login/session listing. `php artisan maxmind:update` downloads `GeoLite2-City.mmdb` to `storage/app/maxmind/` using `MAXMIND_LICENSE_KEY`, skips when the database is fresh (`MAXMIND_UPDATE_DAYS`, default 7), and uses a file lock to prevent repeated concurrent downloads. `routes/console.php` schedules it weekly.

Desktop local development and Railway-style proxy deployment can present `request()->ip()`/`REMOTE_ADDR` as `127.0.0.1` or a private LAN/proxy address. `UserPayloads::sessionRequestIp()` uses the real socket IP when it is public; only when the socket IP is private/local may it trust the first valid public candidate from `publicIp`, `X-Vibyra-Public-IP`, `CF-Connecting-IP`, `X-Real-IP`, or `X-Forwarded-For`. This prevents desktop `/api/session` and `/api/account/sessions` refreshes from overwriting a real public session IP back to localhost while still ignoring client-spoofed forwarded IPs on normal public requests. CORS must allow `X-Vibyra-Public-IP` for browser-origin desktop account calls.

`VibyraAppController` composes both `UserPayloads` and `AccountEndpoints`. Keep the auth response helper named `UserPayloads::sessionPayload(Request, User)` and the account-device row helper named `AccountEndpoints::accountSessionPayload(VibyraSession, bool)`; if both traits define `sessionPayload`, PHP fatals before protected routes or tests can run.

If mobile web login fails with `POST http://<LAN-IP>:8000/api/auth/login net::ERR_CONNECTION_REFUSED`, check whether the Laravel backend is listening on port 8000. From the repo root, `npm run backend` starts `php artisan serve --host=0.0.0.0 --port=8000`, matching `EXPO_PUBLIC_API_URL`.

If desktop/mobile login fails with `SQLSTATE[HY000]: General error: 11 database disk image is malformed` against `backend/database/database.sqlite`, treat the local SQLite file as corrupt. First preserve it with a timestamped `.bak`, then recreate `backend/database/database.sqlite` and run `php artisan migrate --force` from `backend/`. Do not start with `php artisan optimize:clear` after an empty DB reset because `CACHE_STORE=database` can make that command fail until the `cache` table exists. After migrations, verify with `PRAGMA integrity_check`, confirm `sessions`, `cache`, `users`, and `vibyra_sessions` exist, then run `php artisan optimize:clear`.

Desktop email login has two backend hops: browser JS posts `/api/auth/login`, then the local desktop bridge posts `/desktop/session` and verifies the returned bearer token through backend `/api/session`. Keep `desktop/lib/desktopAccount.mjs` pinned to `VIBYRA_DESKTOP_API_URL` or local `http://127.0.0.1:8000`; do not fall back to global `VIBYRA_API_URL`, because local dev shells may export production Railway there while the login UI is using localhost. That mismatch makes `/desktop/session` return the generic `Application failed to respond` error even though direct `/api/auth/login` works.

## Session State

`POST /api/session/state` accepts `{ onboardingComplete, rememberedDesktops, appState }` and persists per user.

Editable project memory has focused authenticated CRUD routes under
`/api/project-memory/{projectId}`. Mutations update only
`app_state.projectMemories`; `/api/session/state` merges project-memory records
by `updatedAt` so stale full-state mobile sync cannot erase newer desktop
memory. The canonical limits remain eight entries per project and 220
characters per entry; `brief` entries cannot be deleted.

The mobile `useCloudSync` debounce writes remote app state. On backend failure it backs off before retrying to avoid repeated background logs.

Any new background Laravel request should pass `{ background: true }` to `appApiRequest`; user-initiated requests should not.
