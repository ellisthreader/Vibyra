---
name: vibyra-expo-web-diagnostics
description: Diagnose Vibyra Expo/mobile web failures, especially AppEntry.bundle 500s, strict MIME type application/json script errors, Metro UnableToResolveError messages, missing i18n modules, localhost 8081/8082 server issues, and signup/login "Could not reach Vibyra" fetch failures.
---

# Vibyra Expo Web Diagnostics

Use this skill when the Vibyra Expo app fails to load in the browser, the console reports `AppEntry.bundle` 500, strict MIME type refusal because the bundle is `application/json`, Metro says `UnableToResolveError`, or auth/signup/login reports "Could not reach Vibyra" / `failed to fetch`.

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

## Desktop Test Preview

When the desktop Test tab selects an Expo project, inspect
`desktop/lib/previewExpo.mjs`, `previewDevServer.mjs`, and `preview.mjs`.
The resolver must prefer a verified Metro runtime over a generic root
`index.html`; large monorepos can contain stale placeholder HTML and nested
Laravel markers that are not the selected app.

Reuse an existing Expo port only when the served `<title>` matches the selected
project's `app.json` or package identity and its `AppEntry.bundle` returns
JavaScript. If no matching Metro server exists, the Test flow should expose the
allowlisted `npm run <script> -- --host lan --port <port>` plan and run it only
after the visible confirmation.

When an Expo package also has wrapper scripts such as `start: npm run dev` or a
shell-based `dev` command that starts backend plus Expo, the dedicated Expo web
profile must win before generic project-script detection. Launch the Expo
`web`/`start`/`dev` script directly with an explicit free `--port`; do not run
the wrapper, restart a live backend, or allow an interactive port prompt.

If no browser runtime is available, return a specific detected reason.
Distinguish package-only folders, unrecognized package scripts, and non-web
Python/CLI apps instead of returning one generic failure or showing a Start
button that cannot succeed.

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

For Vibyra Desktop email login, inspect the two-hop same-origin path instead:

- renderer `POST /desktop/auth/login`
- bridge `desktop/lib/desktopAuthProxy.mjs`
- account API `/api/auth/login`

Confirm `/desktop/state` reports the intended `appApiUrl`, then post invalid
diagnostic credentials to `/desktop/auth/login`. A reachable account API should
return its real `401` validation response, not a `502` network message.
Transient bridge fetch failures should retry once with a bounded timeout, and
persistent failures must describe the account service as unreachable without
claiming the whole desktop has lost network connectivity.

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
