# App - Cloud Sync

Read this for account session state sync, background API calls, backend offline gating, and `/api/session/state` errors.

## Main Files

- `src/context/useCloudSync.ts`
- `src/utils/appApi.ts`
- `src/context/AppContext.tsx`
- `src/utils/persistence.ts`

## State Sync

`useCloudSync` debounces 700ms and posts `/api/session/state` when authenticated. Payload includes onboarding state, remembered desktops without tokens, chat threads/titles/projects, prompt money, and selected models.

## Background API Gate

Background calls pass `{ background: true }` to `appApiRequest`. They short-circuit before `fetch` when the backend is marked offline or has not yet been proven reachable by a foreground request. This prevents cold-start console noise such as `ERR_CONNECTION_REFUSED` for `/api/session/state` when no backend is listening on the dev LAN IP.

Skipped background syncs stay silent. Real request failures set a per-instance retry cooldown and can log "Saved locally. Cloud sync will retry when the API is reachable."

`markBackendOffline` sets a 60s shared cooldown and clears `backendKnownOnline`; `markBackendOnline` clears the cooldown and marks the backend proven. Foreground/user-initiated requests bypass the background gate so real failures still surface.

Set `EXPO_PUBLIC_ALLOW_BACKGROUND_API_PROBES=true` only if background calls should probe an unproven backend.

## Skills Fetch

`AppProvider` fetches `GET /api/skills` once on mount using `{ background: true }`. The effect depends on the stable `setChatSkills` setter extracted from `setters`; depending on the whole `setters` object would refire on each render and spam the API.
