# App - Pairing And Connection

Read this for PC reachable/not reachable, Wi-Fi pairing, remembered desktops, token reconnect, desktop discovery, and the shared desktop folder picker.

## Folder Browser Modal

`src/screens/workspace/inline/FolderBrowserModal.tsx` is the shared component for picking a folder from the paired desktop. Generic interface: `{ visible, onClose, onSelect(folder), browseDesktopPath, label? }`. Two callers today:

- **AI Chat recovery** (`chunk9.tsx`): triggered when the user says "wrong folder"; on select it calls `onAcceptFolderProposal(proposalId, folder)`.
- **Projects page Browse PC button** (`chunk8.tsx`): only renders when `props.connected`; on select it calls `app.adoptProject(folder)` then `props.onOpenProjectPreview(folder.id, folder.name)` to navigate into the project — no chat round-trip required. This is the non-AI folder-pick path.

When adding a third caller, reuse this modal — do not inline a copy. The modal owns its own listing/search state and uses `app.browseDesktopPath` (passed in) to walk the desktop tree.

**Stability gotcha:** `app.browseDesktopPath` from `useDesktopFolders.ts` is *not* memoized — its reference changes every render. The modal must keep it in a `useRef` and the open-on-visible `useEffect` must depend only on `visible`, otherwise the effect re-fires on every parent render and you get an infinite request loop (a 405/401 from the desktop spams the console). Guard fetches with `try/catch` so transport errors surface as an in-modal error string instead of an unhandled rejection.

Browse/file GET requests use route-specific timeouts in `useRequests.ts` and may retry safe GETs across `connection.connectionUrls` when the paired desktop URL is stale. When a fallback URL succeeds, `useRequests.ts` notifies `useDesktopUrlPromotion.ts`, which promotes that URL into `connection.url`, `agentUrl`, and the matching remembered desktop so the next POST does not target a stale primary. `useDesktopFolders.ts` maps browse timeouts to modal recovery copy.

Pairing scans rely on `src/utils/network.ts::fetchWithTimeout` to normalize its own `AbortController.abort()` into `TimeoutError`. If React Native or browser fetch surfaces "signal aborted without reason" while the desktop is open, inspect that helper first; user-facing pairing copy should not expose platform abort wording. LAN pair probes in `src/context/pairingHelpers.ts` intentionally use a longer budget than health probes because Expo fetch over Wi-Fi can take more than one second even when the desktop bridge is reachable.

Desktop tokens are persisted by the desktop bridge, but an older process-local token can still be stale after upgrading/restarting. `useLiveSync.ts` treats a 401 / missing desktop token as a disconnected session and clears `connection`/`paired`, so the UI no longer says connected while browse routes reject auth.

The PC switcher exposes Disconnect PC. It calls `AppContext.disconnectDesktop`, which clears the active connection/session, preview, and loaded files while keeping remembered desktops for later reconnect. For valid active sessions it also posts authenticated `POST /desktop/disconnect` so the desktop shell immediately stops showing a connected phone.

Authenticated desktop requests now centralize stale-session handling in `useRequests.ts`: a missing/invalid token clears `AppContext`'s active desktop session and removes the matching remembered token, so reconnect cannot keep reusing a bad credential.

Desktop connection status is heartbeat-based. Authenticated phone routes refresh desktop `phoneSession.lastSeenAt`; `/desktop/state` and `/health` only report `pairedDevice` while that heartbeat is recent. If `/events` live sync fails because the desktop disappears, the phone clears `connection`/`paired` and marks the remembered desktop offline.

Chat desktop-connection prompts can carry a pending folder-search intent through pairing. `useWorkspaceActions.ts` stores the intent, flips the card from `pair` to `open` after `app.connection` returns, then replaces the card with either a folder proposal or a no-match recovery message. Do not leave a resumed search with zero matches on the `open` stage, or the phone UI appears stuck on "Opening..." after reconnect.

For future deep diagnosis of "connected but cannot browse/open files" failures, use `.agents/skills/vibyra-desktop-connection-diagnostics/SKILL.md`.

## Main Files

- `src/context/usePairingActions.ts`
- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/context/pairingHelpers.ts`
- `src/utils/network.ts`
- `src/utils/persistence.ts`
- `src/screens/onboarding/steps/ConnectStepTwo.tsx`

## Pairing Flow

`usePairingActions` scans Wi-Fi candidates for a desktop pair code, posts `/pair`, waits on `/pair/status`, stores `{ url, token, machineName }` as `connection`, then loads desktop projects and first project files after approval.

Auto Find no longer depends on or displays a pair code from `/health`. Nearby desktop candidates are discovered by `/health`/UDP, and tapping one sends a code-less `{ autoPair: true }` pairing request to `/pair`; the desktop still requires local approval before returning a token. Manual pairing by code remains the fallback when discovery cannot find the PC.

Connection UI should stay simple: Automatic and Manual tabs. Automatic finds nearby PCs and tapping one sends the desktop approval request; Manual only asks for the desktop code and then waits for PC approval. Keep this pattern in both onboarding (`ConnectStepTwo.tsx`) and the workspace PC switcher (`chunk4.tsx`).

Pair-by-code discovery should prioritize POST `/pair` probes over a full `/health` pre-scan. `src/context/pairingScans.ts::scanPairByCode` prepends remembered desktop URLs and known `connectionUrls`, then scans LAN candidates in larger batches with short LAN timeouts; after a pair request succeeds it performs one `/health` call only to recover alternate connection URLs. This keeps manual "Finding Vibyra Desktop" fast without changing approval or token handoff.

Pair-by-code scans send one shared phone `requestId` across candidate URLs for the same attempt. Desktop `/pair` treats duplicate posts with that `clientRequestId` as idempotent, so multiple reachable LAN URLs for the same desktop do not replace the pending request and trigger "Desktop lost the pairing request".

The app persists the desktop bearer token locally for fast reconnect, but `useCloudSync` strips that token before sending remembered desktops to the cloud API.

Token reconnect only uses a remembered token. If the token is missing or invalid, the app should not silently read a pair code from `/health` and auto-pair; it should return to the normal approval flow.

## Reachability Rules

Remembered desktop scan results can include offline/stale PCs for display, but only `online`/`current` entries count as reachable. Offline entries should not make onboarding look connected.

Auto Find and manual code discovery have a shared 90-second discovery ceiling (`DISCOVERY_SCAN_TIMEOUT_MS` in `src/context/pairingHelpers.ts`). When discovery exhausts candidates or hits that deadline without a reachable desktop, mark remembered PCs offline and show a clear "PC appears offline" recovery message instead of leaving the phone in a searching state.

Desktop `/health` advertises `connectionUrls`. The app persists those alternates on `RememberedDesktop` and uses them as fallbacks for tap-to-pair and token reconnect. Merging health results must not wipe an existing remembered token when the health payload has no token.

Because `/health` no longer includes `pairCode`, remembered desktop merging should prefer overlapping `url`/`connectionUrls`, and only use `pairCode` as a merge key when both sides have a non-empty code.

Desktop `connectionUrls` must only contain phone-reachable LAN addresses. `desktop/lib/state.mjs::lanAddresses` filters virtual interfaces such as Docker bridges (`172.18.0.1`), `br-*`, `veth`, VPN/tunnel devices, and loopback; otherwise the phone may remember or try a PC-local address that cannot route from Wi-Fi and pairing/reconnect appears to hang on "Finding Vibyra Desktop".

## Cross-Boundary Notes

Connection bugs usually cross mobile and desktop. Also read `Vibyra Desktop Memory.md` when the fix may involve desktop routes, discovery, port binding, or `/health`.
