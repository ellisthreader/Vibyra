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

Account session management is backed by real `vibyra_sessions` rows. Session creation stores `deviceName`, optional `installId` as `device_identifier`, request IP, user agent, `created_at`, and `last_used_at`; authenticated requests refresh `last_used_at` plus request metadata. Required migrations include `2026_05_21_000002_add_device_metadata_to_vibyra_sessions_table.php` and `2026_05_21_000003_add_device_identifier_to_vibyra_sessions_table.php`; run `php artisan migrate --force` if login/signup reports a missing session metadata column. Routes: `GET /api/account/sessions` lists current-user `devices` grouped by `device_identifier` (legacy rows group by device name, user agent, and IP) and also returns raw `sessions` for compatibility. Device payloads include `current`, `location`, `createdAt`, `updatedAt`, and `sessionCount`, with the current device sorted first. `DELETE /api/account/devices/{deviceId}` revokes all sessions for one device; `DELETE /api/account/sessions/{sessionId}` revokes one raw session; `DELETE /api/account/sessions` revokes all sessions including the current token. Private, loopback, and reserved IPs are surfaced as `Local network` rather than invented geolocation.

`VibyraAppController` composes both `UserPayloads` and `AccountEndpoints`. Keep the auth response helper named `UserPayloads::sessionPayload(Request, User)` and the account-device row helper named `AccountEndpoints::accountSessionPayload(VibyraSession, bool)`; if both traits define `sessionPayload`, PHP fatals before protected routes or tests can run.

If mobile web login fails with `POST http://<LAN-IP>:8000/api/auth/login net::ERR_CONNECTION_REFUSED`, check whether the Laravel backend is listening on port 8000. From the repo root, `npm run backend` starts `php artisan serve --host=0.0.0.0 --port=8000`, matching `EXPO_PUBLIC_API_URL`.

## Session State

`POST /api/session/state` accepts `{ onboardingComplete, rememberedDesktops, appState }` and persists per user.

The mobile `useCloudSync` debounce writes remote app state. On backend failure it backs off before retrying to avoid repeated background logs.

Any new background Laravel request should pass `{ background: true }` to `appApiRequest`; user-initiated requests should not.
