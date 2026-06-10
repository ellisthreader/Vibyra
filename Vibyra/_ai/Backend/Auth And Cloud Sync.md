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

App-session expiry should return the user to login without wiping local workspace/chat state. Keep this separate from desktop bearer-token expiry, which should only disconnect the paired PC. Account profile writes use `POST /api/account/profile`. Destructive `DELETE /api/account` is provider-aware: email accounts require the current password; Apple/Google accounts require a freshly verified identity token whose provider subject matches the stored `provider_id`. Apple deletion also consumes a new single-use nonce challenge.

Account session management is backed by real `vibyra_sessions` rows. Session creation stores `deviceName`, optional `installId` as `device_identifier`, request IP, user agent, `created_at`, and `last_used_at`; authenticated requests refresh `last_used_at` plus request metadata. Required migrations include `2026_05_21_000002_add_device_metadata_to_vibyra_sessions_table.php` and `2026_05_21_000003_add_device_identifier_to_vibyra_sessions_table.php`; run `php artisan migrate --force` if login/signup reports a missing session metadata column. Routes: `GET /api/account/sessions` lists current-user `devices` grouped by `device_identifier` (legacy rows group by device name, user agent, and IP) and also returns raw `sessions` for compatibility. Device payloads include `current`, `location`, `createdAt`, `updatedAt`, and `sessionCount`, with the current device sorted first. `DELETE /api/account/devices/{deviceId}` revokes all sessions for one device; `DELETE /api/account/sessions/{sessionId}` revokes one raw session; `DELETE /api/account/sessions` revokes all sessions including the current token. Private, loopback, and reserved IPs are surfaced as `Local network`.

App-session lifecycle is owned by `App\Services\Auth\SessionAuthenticator` and `SessionTokenRotator`. Migration `2026_06_09_000030_add_lifecycle_fields_to_vibyra_sessions_table.php` adds sliding idle expiry, fixed absolute expiry, token-rotation grace, and revocation metadata. `DELETE /api/auth/logout` revokes only the presented session; `POST /api/auth/session/rotate` returns a replacement bearer token while the prior token remains valid briefly. Rotation is explicit so streaming and older callers are not silently invalidated. Rollout controls are in `config/session_security.php`: lifecycle `off|observe|enforce`, rotation `off|manual`, timeout minutes, and previous-token grace seconds. Account session/device revocation now preserves rows with `revoked_at` and `revocation_reason`; active listings exclude them.

Mobile derives one label in `src/utils/deviceIdentity.ts` from Expo native
constants, with platform fallbacks when a custom name is unavailable. It sends
that value during auth and pairing. On authenticated startup,
`POST /api/account/session/device` refreshes the current session's
`device_name` and stable `device_identifier`, allowing older generic session
rows to show the phone label in Settings without requiring a new login.

Public-IP account session locations use MaxMind GeoLite2 City locally through `App\Services\SessionLocationResolver`; it returns `City, Country` or country-only when available and caches resolved labels for 7 days. When the database is missing or unreadable it returns the public IP but does not cache that fallback; cache keys include the database modification time so installing or refreshing the database takes effect immediately. Do not call a hosted geolocation API on login/session listing. `php artisan maxmind:update` downloads `GeoLite2-City.mmdb` to `storage/app/maxmind/` using the current MaxMind permalink with Basic Auth from `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY`, skips when the database is fresh (`MAXMIND_UPDATE_DAYS`, default 7), and uses a file lock to prevent repeated concurrent downloads. `routes/console.php` schedules it weekly, and `npm run desktop:setup` runs it when both credentials are configured.

Desktop local development and Railway-style proxy deployment can present `request()->ip()`/`REMOTE_ADDR` as `127.0.0.1` or a private LAN/proxy address. `UserPayloads::sessionRequestIp()` uses the real socket IP when it is public; only when the socket IP is private/local may it trust the first valid public candidate from `publicIp`, `X-Vibyra-Public-IP`, `CF-Connecting-IP`, `X-Real-IP`, or `X-Forwarded-For`. This prevents desktop `/api/session` and `/api/account/sessions` refreshes from overwriting a real public session IP back to localhost while still ignoring client-spoofed forwarded IPs on normal public requests. CORS must allow `X-Vibyra-Public-IP` for browser-origin desktop account calls.

`VibyraAppController` composes both `UserPayloads` and `AccountEndpoints`. Keep the auth response helper named `UserPayloads::sessionPayload(Request, User)` and the account-device row helper named `AccountEndpoints::accountSessionPayload(VibyraSession, bool)`; if both traits define `sessionPayload`, PHP fatals before protected routes or tests can run.

If mobile web login fails with `POST http://<LAN-IP>:8000/api/auth/login net::ERR_CONNECTION_REFUSED`, check whether the Laravel backend is listening on port 8000. From the repo root, `npm run backend` starts `php artisan serve --host=0.0.0.0 --port=8000`, matching `EXPO_PUBLIC_API_URL`.

If desktop/mobile login fails with `SQLSTATE[HY000]: General error: 11 database disk image is malformed` against `backend/database/database.sqlite`, treat the local SQLite file as corrupt. First preserve it with a timestamped `.bak`, then recreate `backend/database/database.sqlite` and run `php artisan migrate --force` from `backend/`. Do not start with `php artisan optimize:clear` after an empty DB reset because `CACHE_STORE=database` can make that command fail until the `cache` table exists. After migrations, verify with `PRAGMA integrity_check`, confirm `sessions`, `cache`, `users`, and `vibyra_sessions` exist, then run `php artisan optimize:clear`.

Desktop email login has two backend hops: browser JS posts `/api/auth/login`, then the local desktop bridge posts `/desktop/session` and verifies the bearer token through backend `/api/session`. Both hops must use the same URL. The `Vibyra Desktop` launcher resolves `VIBYRA_DESKTOP_API_URL` from explicit desktop config, then `VIBYRA_API_URL`, then root `EXPO_PUBLIC_API_URL`; `desktop/lib/state.mjs::publicState()` exposes that URL as loopback-only `appApiUrl`, and `desktop/assets/app.auth-helpers.js` uses it for renderer auth. Do not let the renderer silently use localhost while the bridge verifies against Railway, or vice versa.

Mobile provider login uses `expo-apple-authentication` and
`@react-native-google-signin/google-signin`. The mobile client sends provider
identity tokens, never `installId` as identity. Backend
`ProviderIdentityVerifier` verifies RS256 signatures with cached JWKS and fails
closed on issuer, configured audience, expiry, subject, verified-email, or
Apple nonce mismatch. `POST /api/auth/provider/challenge` issues single-use
Apple nonce challenges. Configure `GOOGLE_AUTH_CLIENT_IDS` and
`APPLE_AUTH_CLIENT_IDS` as comma-separated accepted audiences.

Email signup sends `VibyraVerifyEmail`; resend is
`POST /api/auth/email/resend`, and the signed verification route redirects to
`vibyra://email-verified`. Password recovery uses
`POST /api/auth/password/forgot`, the HTTPS
`GET /api/auth/password/open` bridge into `vibyra://reset-password`, and
`POST /api/auth/password/reset`; a successful reset revokes existing app
sessions. Auth entry routes have per-minute throttles and generic recovery
responses to avoid account enumeration. Production requires an HTTPS
`APP_URL` and working mail transport.

## Session State

`POST /api/session/state` accepts `{ onboardingComplete, rememberedDesktops, appState }` and persists per user.

Editable project memory has focused authenticated CRUD routes under
`/api/project-memory/{projectId}`. Mutations update only
`app_state.projectMemories`; `/api/session/state` merges project-memory records
by `updatedAt` so stale full-state mobile sync cannot erase newer desktop
memory. The canonical limits remain eight entries per project and 220
characters per entry; `brief` entries cannot be deleted.

Full Markdown memory is backend-owned in `project_memory_vaults` and
`project_memory_nodes`, separate from legacy `app_state`. Authenticated vault
routes provide flat folder/document nodes through `GET .../vault`, node
`POST`/`PATCH`/`DELETE`, and normalized Markdown manifests through
`POST .../imports`; imports never accept local filesystem paths. Node updates
support version checks, non-empty folder deletion requires `recursive`, and
imports enforce relative `.md` paths plus file/count/size limits. Start in
`ProjectMemoryEndpoints.php` and `App\Services\ProjectMemory\`.

`POST /api/session/state` merges incoming `appState` over existing keys rather
than replacing the entire object, so older clients preserve fields they do not
send. The eight-entry compatibility projection always retains brief entries.

The mobile `useCloudSync` debounce writes remote app state. On backend failure it backs off before retrying to avoid repeated background logs.

Any new background Laravel request should pass `{ background: true }` to `appApiRequest`; user-initiated requests should not.
