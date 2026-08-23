---
name: vibyra-expo-web-diagnostics
description: Diagnose Vibyra Expo/mobile web failures, especially AppEntry.bundle 500s, strict MIME type application/json script errors, Metro UnableToResolveError messages, missing i18n modules, localhost 8081/8082 server issues, and signup/login "Could not reach Vibyra" fetch failures.
---

# Vibyra Expo Web Diagnostics

Use this skill when the Vibyra Expo app fails to load in the browser, the console reports `AppEntry.bundle` 500, strict MIME type refusal because the bundle is `application/json`, Metro says `UnableToResolveError`, or auth/signup/login reports "Could not reach Vibyra" / `failed to fetch`.

For a healthy Expo runtime that fails only inside Desktop Test or phone
Preview, use `vibyra-preview-diagnostics`; keep this skill focused on Metro,
module resolution, Expo web startup, and backend reachability.

## Required Memory Reads

Before broad source exploration, read:

- `Vibyra/_ai/Memory Protocol.md`
- `Vibyra/_ai/Context Map.md`
- `Vibyra/_ai/Project Context.md`
- `Vibyra/_ai/Vibyra App Memory.md`
- `Vibyra/_ai/App/Navigation UI.md` for app load/UI issues, or `Vibyra/_ai/App/Cloud Sync.md` for auth/backend reachability.
- `Vibyra/_ai/Runbook.md`

## Bundle 500 Rule

When the browser says a script was refused because its MIME type is `application/json`, do not debug MIME headers first. Metro is returning a JSON error payload instead of JavaScript.

Fetch the bundle body and read the real error:

```bash
curl -i 'http://localhost:8082/node_modules/expo/AppEntry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable'
```

If the response is `500` with `Content-Type: application/json`, fix the reported Metro error. After the fix, verify the same bundle URL returns `200` and `Content-Type: application/javascript`.

## Missing Module Checks

For `UnableToResolveError`, inspect the exact import path and confirm the file exists with a supported extension.

For translation failures, check `src/context/translations.ts` against the files in `src/context/i18n/`:

```bash
rg --files src/context/i18n
sed -n '1,80p' src/context/translations.ts
```

Each imported locale module must exist and export the matching symbol. Example: `import { pt } from "./i18n/pt"` requires `src/context/i18n/pt.ts` with `export const pt`.

If Metro still reports a module missing after the file exists, restart the Expo server. The running dependency graph can stay stale after a resolver miss.

## Native Modules On Web

For `Cannot find native module 'ExpoIap'` or similar errors, catching a failed
call after a top-level native import is too late because Expo web resolves the
module while loading the bundle. Keep the native hook in `.ts` and add a
platform-specific `.web.ts` implementation. Web purchase flows should use the
existing Stripe checkout path or a deliberate no-op when the owning component
already handles Stripe.

Verify the focused hook tests, run `npm run typecheck`, and export Expo web.
Search the generated bundle to confirm the native module name is absent.

## Expo Server Checks

Check which Expo processes are already running before starting another server:

```bash
ps -eo pid,cmd
curl -I http://localhost:8081
curl -I http://localhost:8082
```

If Expo asks interactively to switch ports, start the intended port explicitly:

```bash
npx expo start --web --port 8082
```

Do not leave a needed dev server stopped. If you kill an Expo process to clear stale Metro state, restart it and verify the browser URL and bundle URL.

### Phone QR Timeout Rule

When an agent starts Expo for a phone QR code, do not keep Metro inside a
bounded shell command. A successful initial launch can be killed when the tool
timeout expires, leaving a valid-looking QR that fails on the phone with an
unknown request-timeout error. Start Metro as a detached background process,
redirect its logs to `tmp/`, and verify the process remains listening after the
launch command returns.

Before presenting the QR, verify all three over the machine's active default-
route Wi-Fi IPv4 address:

1. `/status` returns `packager-status:running`;
2. the Expo manifest returns `200 application/expo+json` with the same LAN host;
3. the manifest's native `launchAsset.url` returns `200 application/javascript`.

Warm the native bundle before asking the user to scan. A full Metro cache crawl
and first Hermes transform can exceed a phone's request timeout even when the
bundle is valid. A cache-deserialization warning is recoverable only when Metro
falls back to a full crawl and the bundle check subsequently passes.

### Expo Go iPhone Launch Rule

Vibyra is pinned to Expo SDK 54 so the physical-iPhone App Store version of
Expo Go can open a phone-testing QR. Expo's May 2026 SDK 55 release did not
reach the iOS App Store; a phone that is already on the latest store build can
therefore report that an SDK 55/56 project requires a newer Expo Go version.
SDK 55+ physical-iPhone testing requires TestFlight/`eas go` or a development
build instead. Start the App Store path explicitly with
`npx expo start --go --lan --port <port>`; `expo-dev-client` is also installed,
so omitting `--go` selects the wrong runtime automatically.

The Expo Go compatibility boundary is intentional. `expo-iap` and native Google
Sign-In are not supplied by Expo Go. `src/utils/expoGoSafeIap.ts` returns an
unavailable-store adapter in Expo Go, and `src/utils/nativeAuth.ts` loads Google
Sign-In only after confirming the runtime is not Expo Go. Keep the native
modules and config plugins for development/store builds; do not eagerly import
them into the Expo Go execution path.

Before showing `exp://<lan-ip>:<port>`, verify the manifest reports SDK 54 and
the LAN iOS bundle returns `200 application/javascript`.

Do not trust `/status` alone when several Expo projects are running. Resolve
the listener command line and confirm the manifest's `extra.expoClient.name`,
SDK, main module, and LAN bundle host belong to Vibyra. Use a free explicit
port instead of stopping another project's Metro server. `metro.config.js`
excludes Vibyra's desktop app, backend/vendor, vault, and large `tmp/` trees from
the mobile file-map crawl; preserve those exclusions so a cleared cache does
not spend minutes scanning tens of thousands of non-mobile files.

## Auth Fetch Failures

For signup/login "Could not reach Vibyra" or `failed to fetch`, verify the Laravel backend before changing auth code.

The root `.env` `EXPO_PUBLIC_API_URL` should point to the dev machine on port `8000`, and Laravel must be listening:

```bash
curl -I http://127.0.0.1:8000/api/skills
curl -I http://192.168.1.109:8000/api/skills
```

Start the backend with:

```bash
npm run backend
```

or run Laravel and Expo together with:

```bash
npm run dev
```

Only inspect `src/utils/appApi.ts`, `src/context/AppContext.tsx`, and `backend/routes/web.php` after backend liveness is proven.

For Vibyra Desktop email login, inspect the Tauri account client instead:
`desktop-tauri/src-tauri/src/account_api.rs` calling `/api/auth/login` on the
account API. On a fresh checkout the root `.env` is not tracked, so the desktop
app must default to the Railway production API and must not inject localhost
unless the user explicitly sets `VIBYRA_DESKTOP_API_URL`.

## Verification

For bundle fixes:

```bash
curl -I 'http://localhost:8082/node_modules/expo/AppEntry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable'
```

Expected:

- `HTTP/1.1 200 OK`
- `Content-Type: application/javascript; charset=UTF-8`

For auth reachability:

```bash
curl -I http://127.0.0.1:8000/api/skills
```

Expected:

- `HTTP/1.1 200 OK`

After durable fixes, update the focused app memory note or `Vibyra/_ai/Runbook.md`.
