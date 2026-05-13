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

App-session expiry should return the user to login without wiping local workspace/chat state. Keep this separate from desktop bearer-token expiry, which should only disconnect the paired PC.

## Session State

`POST /api/session/state` accepts `{ onboardingComplete, rememberedDesktops, appState }` and persists per user.

The mobile `useCloudSync` debounce writes remote app state. On backend failure it backs off before retrying to avoid repeated background logs.

Any new background Laravel request should pass `{ background: true }` to `appApiRequest`; user-initiated requests should not.
