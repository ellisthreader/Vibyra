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

Expo web runs can derive the bundle host from `NativeModules.SourceCode.scriptURL`; if that host is a public/WAN IP, it must not become `http://<public-ip>:4317/health`. `src/utils/network.ts` treats web's default desktop URL as loopback (`127.0.0.1:4317`) and filters desktop probes to loopback/private LAN HTTP URLs or explicit HTTPS relay URLs, while preserving `EXPO_PUBLIC_DESKTOP_URL` when deliberately configured.

Desktop tokens are persisted by the desktop bridge, but an older process-local token can still be stale after upgrading/restarting. `useLiveSync.ts` treats a 401 / missing desktop token as a disconnected session and clears `connection`/`paired`, so the UI no longer says connected while browse routes reject auth.

The PC switcher exposes Disconnect PC. It calls `AppContext.disconnectDesktop`, which clears the active connection/session, preview, and loaded files while keeping remembered desktops for later reconnect. For valid active sessions it also posts authenticated `POST /desktop/disconnect` so the desktop shell immediately stops showing a connected phone.

Authenticated desktop requests now centralize stale-session handling in `useRequests.ts`: a missing/invalid token clears `AppContext`'s active desktop session and removes the matching remembered token, so reconnect cannot keep reusing a bad credential.

Desktop connection status is heartbeat-based. Authenticated phone routes refresh desktop `phoneSession.lastSeenAt`; `/desktop/state` and `/health` only report `pairedDevice` while that heartbeat is recent. If `/events` live sync fails because the desktop disappears, the phone clears `connection`/`paired` and marks the remembered desktop offline.

Chat desktop-connection prompts can carry a pending folder-search intent through pairing. `useWorkspaceActions.ts` stores the intent, flips the card from `pair` to `open` after `app.connection` returns, then replaces the card with either a folder proposal or a no-match recovery message. Do not leave a resumed search with zero matches on the `open` stage, or the phone UI appears stuck on "Opening..." after reconnect.

Onboarding Step 2 keeps account-gate errors local and simple. `src/screens/welcome/steps/StepSetup.tsx` maps desktop account mismatch / missing phone identity errors to the stable red copy "Log in to Vibyra Desktop with the same account as your phone." and backs auto-pair retries off briefly so `discoverPairableDesktops()` clearing `pairingError` does not make the message blink.

For future deep diagnosis of "connected but cannot browse/open files" failures, use `.agents/skills/vibyra-desktop-connection-diagnostics/SKILL.md`.

## Main Files

- `src/context/usePairingActions.ts`
- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/context/pairingHelpers.ts`
- `src/utils/network.ts`
- `src/utils/persistence.ts`
- `src/screens/welcome/WelcomeConnectScreen.tsx`
- `src/screens/welcome/steps/StepSetup.tsx`
- `src/screens/welcome/steps/StepApprove.tsx`
- `src/screens/welcome/hooks/useWelcomeFlow.ts`
- `src/screens/workspace/hooks/useWorkspaceState.ts`

## Pairing Flow

`usePairingActions` scans Wi-Fi candidates for a desktop pair code, posts `/pair`, waits on `/pair/status`, stores `{ url, token, machineName }` as `connection`, then loads desktop projects and first project files after approval.

Auto Find no longer depends on or displays a pair code from `/health`. Nearby desktop candidates are discovered by `/health`/UDP, and tapping one sends a code-less `{ autoPair: true }` pairing request to `/pair`; the desktop still requires local approval before returning a token. Manual pairing by code remains the fallback when discovery cannot find the PC.

Pair requests include the phone's `accountId`; the desktop bridge only queues approval when its loopback-verified desktop account matches that id. Onboarding Step 2 may try reachable desktops until one accepts the same-account request, but it must not rely on account identity from `/health`.

Connection UI should stay simple: Automatic and Manual tabs. Automatic finds nearby PCs and tapping one sends the desktop approval request; Manual only asks for the desktop code and then waits for PC approval. Keep this pattern in both onboarding (`src/screens/welcome/steps/StepSetup.tsx`, the "Find my PC" / "Use a code" tabs) and the workspace PC switcher (`chunk4.tsx`).

## Welcome + PC Setup Flow (post-paywall gate)

Post-paywall, onboarding routes into `src/screens/welcome/WelcomeConnectScreen.tsx`. The screen has 4 sub-steps driven by `useWelcomeFlow`:

1. **Hero** (`StepHero.tsx`) — animated logo, personalized greeting, "Let's get started" CTA, "Skip for now" pill.
2. **Setup** (`StepSetup.tsx`) — combined download-prompt + radar discovery + tap-to-pair list. "Find my PC" (auto) / "Use a code" (manual) tabs. Reuses `app.discoverPairableDesktops`, `app.pairMachineAt`, `app.pairMachine`.
3. **Confirm/Approve** (`StepApprove.tsx`) — shown only after Desktop has already approved and returned `pendingPhoneApproval`; copy must ask the user to approve/confirm on the phone, not approve on PC. Keep the phone/desktop connection artwork centered with large unframed icons and no purple circular backing shapes. Confirmation sheet shown here on skip.
4. **Connected** (`StepConnected.tsx`) — sparkle burst + spring checkmark, auto-advances after 2.4s.

### Routing gate is local-only

Two flags gate entry to the workspace:

- `onboardingComplete` (cloud-synced) — flipped after the quiz/paywall.
- `pcSetupComplete` (**local-only**, persisted to `PersistedSession` but stripped from `PersistedUser` so backend cannot flip it).
- `pcSetupSkipped` (**local-only**) records that the user explicitly skipped PC setup. Workspace auto-reconnect must respect this flag so a remembered desktop token does not immediately make the dashboard look connected after "Skip for now". A successful desktop connection clears the flag.

`App.tsx`: `if (!app.onboardingComplete || !app.pcSetupComplete) return <OnboardingScreen>`. `OnboardingScreen` initial step is `7` (WelcomeConnect) when onboarding is complete but PC setup is not — so IAP receipts that flip `onboardingComplete` server-side can never bypass the PC pairing UX. `signOut` resets both flags. `WelcomeConnectScreen` calls `app.completePcSetup()` on successful pair OR confirmed skip.

When no active `connection` exists, the workspace dashboard title must use neutral copy such as "Connect PC" instead of falling back to `rememberedDesktops[0].machineName`; remembered desktops are suggestions, not proof of a current session. Confirmed skip calls `skipPcSetup()` and clears pending/active pairing state when needed.

### Reduce Motion + a11y

All animation hooks (`useFloatLoop`, `useRadarPulse`, `useEntrance`, particle/sparkle drivers) short-circuit when `AccessibilityInfo.isReduceMotionEnabled()` returns true. `StepIndicator` is `accessibilityRole="progressbar"`. Each step announces itself via `AccessibilityInfo.announceForAccessibility` on entry. Hardware back: Hero exits; Setup→Hero; Approve→skip-confirm; Connected disabled.

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
