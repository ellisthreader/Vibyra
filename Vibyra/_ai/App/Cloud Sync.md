# App - Cloud Sync

Read this for account session state sync, background API calls, backend offline gating, and `/api/session/state` errors.

## Main Files

- `src/context/useCloudSync.ts`
- `src/utils/appApi.ts`
- `src/context/AppContext.tsx`
- `src/utils/persistence.ts`

## State Sync

`useCloudSync` debounces 700ms and posts `/api/session/state` when authenticated. Payload includes onboarding state, remembered desktops without tokens, chat threads/titles/projects, prompt money, and selected models.

Local app persistence is native-safe as of 2026-05-12. `src/utils/nativeStorage.ts` uses `localStorage` on web and `@react-native-async-storage/async-storage` on iOS/Android; `src/utils/persistence.ts` stores auth token, install ID, onboarding, selected chat model, remembered desktops including local desktop tokens, user/account fields, chat state, selected models, edit approvals, and prompt money. `useAppState` waits for async session hydration before saving, and `PreferencesContext` does the same for appearance/language preferences so native startup does not overwrite restored state with defaults. Community comments also use the adapter via `src/screens/workspace/inline/chunk16.tsx`.

## Background API Gate

Background calls pass `{ background: true }` to `appApiRequest`. They short-circuit before `fetch` when the backend is marked offline or has not yet been proven reachable by a foreground request. This prevents cold-start console noise such as `ERR_CONNECTION_REFUSED` for `/api/session/state` when no backend is listening on the dev LAN IP.

Skipped background syncs stay silent. Real request failures set a per-instance retry cooldown and can log "Saved locally. Cloud sync will retry when the API is reachable."

`markBackendOffline` sets a 60s shared cooldown and clears `backendKnownOnline`; `markBackendOnline` clears the cooldown and marks the backend proven. Foreground/user-initiated requests bypass the background gate so real failures still surface.

Auth 401s are not transient sync failures. `appApiRequest` throws `AppApiError` with `status` and `endpoint`; `isAppSessionExpiredError` identifies backend session-expiry/missing-token responses. `useCloudSync`, `useSessionValidation`, and `useAgentActions` call `expireSession` so stale persisted tokens are cleared instead of retrying `/api/session/state` or `/api/chat` indefinitely. Relevant files: `src/utils/appApi.ts`, `src/context/useCloudSync.ts`, `src/context/useSessionValidation.ts`, `src/context/useAgentActions.ts`, `src/context/useAppRemoteSync.ts`.

Set `EXPO_PUBLIC_ALLOW_BACKGROUND_API_PROBES=true` only if background calls should probe an unproven backend.

Signup/login, publish, and AI chat use foreground backend calls. `agentErrors.ts` preserves detailed `Could not reach Vibyra at <url>` messages from `appApiMessages.ts` so chat failures expose the configured API URL instead of only showing generic iPhone Local Network copy. `src/utils/appApi.ts` keeps `EXPO_PUBLIC_API_URL` as the primary source but can recover from a stale bundled LAN IP by trying runtime candidates (`getExpoHost()`, web `window.location.hostname`, and web localhost) and remembering the first candidate whose `/api/skills` responds. `appApiStreamChat` also probes `/api/skills` before web streaming so Analyze Files/Deep Research do not stay pinned to an old Expo env value. A "Could not reach Vibyra ... failed to fetch" auth or chat error usually means Laravel is not listening on any candidate `:8000`; verify with `curl -I http://127.0.0.1:8000/api/skills` and start the default combined workflow with `npm start` (`npm run dev`) or backend-only with `npm run backend`. `npm start` uses `scripts/start-dev.sh`, which refreshes `.env` from the current LAN IP and waits for `/api/skills` before starting Expo. Relevant files: `src/utils/appApi.ts`, `src/utils/appApiStream.ts`, `src/context/AppContext.tsx`, `backend/routes/web.php`.

If reachability is fixed but signup returns a Laravel 500 for missing level tables such as `user_level_events`, run `php artisan migrate --force` in `backend/`; the 2026-05-11 level migrations create `level_*` user fields and `user_level_events`.

## Skills Fetch

`AppProvider` fetches `GET /api/skills` once on mount using `{ background: true }`. The effect depends on the stable `setChatSkills` setter extracted from `setters`; depending on the whole `setters` object would refire on each render and spam the API.
