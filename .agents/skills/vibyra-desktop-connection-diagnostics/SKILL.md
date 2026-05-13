---
name: vibyra-desktop-connection-diagnostics
description: Diagnose Vibyra phone-to-desktop connection bugs where pairing hangs, the desktop loses a pairing request, or the mobile app says connected but desktop actions fail, especially /open, Browse PC, folder/file loading, request timeouts, stale bearer tokens, remembered desktops, or "phone needs to reconnect" errors.
---

# Vibyra Desktop Connection Diagnostics

Use this skill when Vibyra mobile cannot reliably pair with Vibyra Desktop, gets stuck on "Finding Vibyra Desktop", reports "Desktop lost the pairing request", or appears connected but authenticated desktop work fails: `/open`, Browse PC, file loading, previews, `/events`, or errors like "phone not connected", "needs to reconnect", `Missing or invalid desktop token`, 401, or request timeout.

## Required Memory Reads

Before source exploration, read:

- `Vibyra/_ai/Memory Protocol.md`
- `Vibyra/_ai/Context Map.md`
- `Vibyra/_ai/Project Context.md`
- `Vibyra/_ai/Vibyra App Memory.md`
- `Vibyra/_ai/App/Pairing And Connection.md`
- `Vibyra/_ai/Vibyra Desktop Memory.md`

## Diagnostic Rule

Do not trust UI copy such as "Connected to PC" as proof of a valid secure session. In Vibyra, `app.connection` only proves the phone has a stored connection object. Authenticated desktop routes prove the session.

If the desktop route returns `Missing or invalid desktop token`, `401`, or `unauthorized`, treat it as an expired desktop session, not a folder-browser issue.

## Source Files To Inspect First

- `src/context/useRequests.ts`: request timeouts, auth headers, invalid-session handling, fallback URLs.
- `src/context/AppContext.tsx`: `disconnectDesktop`, session clearing, remembered-token removal.
- `src/context/useDesktopUrlPromotion.ts`: promotion of a working fallback LAN URL into the active connection.
- `src/context/usePairingActions.ts`: remembered-desktop reconnect and pair-code flow.
- `src/context/pairingDiscovery.ts`: `/pair` request IDs and `/pair/status` polling.
- `src/context/pairingScans.ts`: LAN candidate order, concurrent `/pair` probes, remembered URL prepending.
- `src/context/usePairingConnectionActions.ts`: remembered-desktop reconnect and explicit stale-token clearing.
- `src/context/useDesktopFolders.ts`: Browse PC and `/open` error copy.
- `src/context/useLiveSync.ts`: `/events` polling and stale-session detection.
- `desktop/lib/state.mjs`: desktop `TOKEN`, `PAIR_CODE`, persisted token path.
- `desktop/lib/pairingHandlers.mjs`: `isAuthed`, `/pair`, `/pair/status`, `/health`.
- `desktop/lib/routes.mjs`: authenticated desktop route boundaries.
- `desktop/lib/projectBrowse.mjs`: `/desktop/browse` filesystem listing.
- `desktop/local-app.mjs`: startup ordering for discovery broadcast, window open, and project discovery.
- `desktop/assets/app.1.js` and `desktop/assets/app.2.css`: whether pending pairing approval is visible above the desktop auth gate.

Use targeted `rg` before expanding:

```bash
rg -n "Missing or invalid desktop token|isAuthed|TOKEN|setConnection\\(|disconnectDesktop|browseDesktopPath|agentRequest|connectRememberedDesktop|requestId|clientRequestId|pair/status|pendingPair|Finding Vibyra Desktop" src desktop
```

## Debugging Sequence

1. Classify the failure before editing:
   - "Finding Vibyra Desktop" usually means candidate scan, LAN timeout, startup discovery, or firewall.
   - "Desktop lost the pairing request" usually means the phone is polling a `/pair/status` `requestId` the desktop no longer recognizes.
   - "Request timed out" after connection usually means stale primary URL, `/events` over-eager disconnect, or slow browse/listing.
   - "Missing or invalid desktop token" means expired session state, not a folder-browser issue.

2. For pairing hangs or lost requests, verify the pair state machine:
   `scanPairByCode` should send one shared phone `requestId` across the candidate URLs for a single attempt. Desktop `/pair` should store that as `clientRequestId` and return the existing pending/approved request for duplicate posts from that same attempt instead of replacing `appState.pendingPair`.

3. Check desktop approval latency:
   `approvePairing` should mark `pendingPair.status = "approved"` before slow `discoverProjects()` work. Desktop startup should open the window and start discovery broadcast before background project discovery, so users can see the pair code and approval UI promptly.

4. Check approval visibility:
   The desktop login gate is visual only. A pending pair request must be visible and actionable above it, either by auto-opening the pair modal or by rendering approval controls on the auth screen. The modal z-index must be higher than `.desktop-auth`.

5. Reproduce a failing authenticated route mentally from UI to route:
   `/open` or Browse PC -> `FolderBrowserModal` -> `app.browseDesktopPath` -> `useDesktopFolders.browseDesktopPath` -> `requests.agentRequest("/desktop/browse...")` -> desktop `routes.mjs` -> `isAuthed`.

6. Check whether the request includes the active bearer token:
   `useRequests.agentRequest` should set `Authorization: Bearer ${connection.token}` when `useAuth` is true.

7. If the route rejects auth, verify invalid-session handling:
   `useRequests.ts` should call the invalid-session callback, `AppContext.disconnectDesktop({ clearRememberedToken: true, ... })` should clear `connection`/`paired`, and the matching remembered desktop token should be removed.

8. If the route times out instead of rejecting auth, then inspect performance/network:
   route-specific timeouts in `useRequests.ts`, safe GET fallback via `connection.connectionUrls`, promotion through `useDesktopUrlPromotion.ts`, and folder listing in `desktop/lib/projectBrowse.mjs`.

9. If reconnect still loops, inspect remembered-desktop flow:
   `connectRememberedDesktop` must not silently reuse an invalid token. It should detect invalid-token responses from `/projects`, explicitly delete the remembered token, and require fresh pair-code reconnect. Do not try to clear with `token: undefined` through `mergeRememberedDesktops`, because that helper preserves existing values by dropping undefined fields.

10. If desktop restart caused the issue, inspect token persistence:
   `desktop/lib/state.mjs` should use `VIBYRA_AGENT_TOKEN` when set, otherwise persist a generated token at `~/.vibyra-agent/desktop-token`. A process-local random token will invalidate remembered phones on every desktop restart.

11. If live sync disconnects a valid session, inspect `/events`:
   `/events` polling should be serialized with an in-flight guard, should tolerate multiple transient failures before clearing session, and should have an explicit shorter timeout than the polling interval plus fallback cycle. Desktop `PHONE_SESSION_TIMEOUT_MS` should be comfortably longer than a few missed polls.

## Proven Failure Patterns

- Parallel LAN `/pair` probes can hit the same desktop through multiple URLs. Without an idempotent phone request ID, a later duplicate replaces the pending request and the phone sees "Desktop lost the pairing request".
- Slow project discovery before approval makes the desktop look like it accepted the click while the phone keeps polling `pending`.
- A visual-only desktop auth gate can hide the approval controls even though the local bridge accepted `/pair`.
- Successful GET fallback is not enough unless the working URL is promoted; otherwise Browse PC can succeed through a fallback and the next POST still targets the stale primary URL.
- Invalid remembered tokens must be deleted, not merged as `undefined`.
- React Native LAN fetch may not reject promptly after `AbortController.abort()`. Use a `Promise.race` timer so scans and route timeouts actually settle.

## Fix Principles

- Fix the state machine before changing copy.
- Make `/pair` idempotent for duplicate posts from the same phone attempt, not globally permissive for unrelated attempts.
- Auth failure should invalidate session state; do not only show a modal error.
- Manual disconnect should clear active session but keep remembered desktops.
- Expired-token disconnect should clear active session and remove the matching remembered token.
- Promote a working fallback URL before allowing later non-fallback POSTs to use the connection.
- Desktop approval UI must not be hidden behind local shell authentication.
- Route timeouts and filesystem optimizations are secondary unless auth has been proven valid.
- After durable fixes, update `Vibyra/_ai/App/Pairing And Connection.md` or `Vibyra/_ai/Vibyra Desktop Memory.md`.

## Verification

Run:

```bash
npm run typecheck
node --check desktop/lib/state.mjs
node --check desktop/lib/pairingHandlers.mjs
node --check desktop/lib/projectBrowse.mjs
node --check desktop/local-app.mjs
node --check desktop/assets/app.1.js
```

For desktop browse behavior, a local smoke test can call `browseDesktopPath()` and `browseDesktopPath(homedir())` from `desktop/lib/projectBrowse.mjs`.
