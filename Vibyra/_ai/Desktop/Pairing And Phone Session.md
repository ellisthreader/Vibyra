# Desktop - Pairing And Phone Session

Read this for pairing requests, phone session state, bearer tokens, `/health`, and LAN URL discovery.

## Files

- `desktop/lib/pairingHandlers.mjs`
- `desktop/lib/state.mjs`
- `desktop/lib/discovery.mjs`
- `desktop/lib/routes.mjs`

## Pairing Flow

`desktop/lib/pairingHandlers.mjs` owns pair-code validation, pending pair state, desktop approval/denial, token handoff after approval, project discovery on approval, and preview-start responses.

The phone supplies a native-derived `deviceName` from
`src/utils/deviceIdentity.ts`. Desktop keeps that name on `pendingPair`,
`phoneSession`, `pairedDevice`, and Pairing activity events, so approval,
waiting, and connected UI use the same label.

`desktop/lib/state.mjs` generates `PORT` (default `4317`), `PAIR_CODE`, `TOKEN`, and LAN connection URLs.

Pairing requests are idempotent per phone attempt. The phone sends a `requestId` with `/pair`; desktop stores it as `clientRequestId` and returns the existing pending/approved request for duplicate posts. This prevents LAN scans across multiple URLs from replacing the request ID the phone is polling.

`desktop/lib/pairingSecurity.mjs` owns pairing-only input and abuse controls.
Pair bodies are capped at 4 KB, fields are bounded, pending and approved
requests expire after two minutes, and `/pair` plus `/pair/status` use generous
per-IP/per-request limits with `Retry-After`. Duplicate approval polling remains
below the normal limit. `VIBYRA_PAIR_RATE_LIMIT_ENABLED=false` is emergency
rollback only. Pair codes use `crypto.randomInt`; mobile request IDs prefer Web
Crypto and are not credentials.

Desktop approval marks the request approved before project discovery so slow filesystem scans do not keep the phone stuck waiting.

The desktop Pair phone modal uses four exclusive waiting, desktop approval,
phone confirmation, and connected states. Waiting exposes a loopback-only generated QR at
`GET /desktop/pair-qr.svg`; `desktop/lib/pairingQr.mjs` encodes only
`vibyra://pair?code=<PAIR_CODE>&url=<phone-reachable-LAN-url>`. The QR never
contains the persisted bearer token or account identity, and scanning still
requires the normal same-account `/pair` request plus explicit desktop
approval. UI ownership is `desktop/assets/app.pairing.js`,
`desktop/assets/app.pairing.css`, the approved-state waiting motion in
`desktop/assets/app.pairing-permission.css`, and the connected-state motion in
`desktop/assets/app.pairing-success.css`, with `app.modals.js` only selecting
the current state. Connected-state celebration is one-shot and becomes static;
reduced-motion users receive the final state immediately.

When `pendingPair.status === "approved"` and no authenticated phone session
exists yet, the modal must show the phone-confirmation state. It must not return
to the QR/code waiting state. `pairedDevice` remains the authority for moving
to connected because it is derived from the real phone session heartbeat.

The production modal has no simulated-connect control or test connection route.
Connection success is driven only by the real phone session and pairing flow.
Keep regression coverage in `desktop/assets/app.modals.test.mjs` so a temporary
`/desktop/pair-test-connect` endpoint or test button is not shipped again.

The finalized modal keeps the existing Vibyra palette and uses a compact,
symmetrical layout: phone-to-desktop status visual, scannable QR, three short
steps, manual code fallback, focused desktop approval, a waiting-for-phone
confirmation state, and a connected state with device capabilities plus a
quiet disconnect action. Connected success uses a
short check spring, expanding ring, radial particles, and staggered content
reveal from `desktop/assets/app.pairing-success.css`; all effects run once,
settle completely, and are disabled under `prefers-reduced-motion`.

Validate pairing UI changes with
`node --test desktop/assets/app.modals.test.mjs desktop/lib/pairingQr.test.mjs`,
`npm run typecheck`, and `git diff --check`. The desktop process must be fully
restarted before live checks because the bridge and Electron renderer can
otherwise retain stale route or asset state.

## Phone Session

Phone connection state is session-based, not only approval-based. Authenticated phone routes call `markPhoneConnected`; `/desktop/state` and `/health` derive `pairedDevice` from recent `phoneSession.lastSeenAt`.

Authenticated `POST /desktop/disconnect` clears the desktop-side phone session when the phone disconnects.

Bearer tokens are stable across desktop restarts. `state.mjs` reads `VIBYRA_AGENT_TOKEN` first, otherwise persists a generated token at `~/.vibyra-agent/desktop-token`.

New approved pairings use per-device bearer credentials from
`desktop/lib/deviceCredentials.mjs`. The phone receives one idempotent
`vdc1.<credentialId>.<32-byte-random-secret>` token per approved pending
request. Desktop persists only the secret SHA-256 hash and credential metadata
in `~/.vibyra-agent/device-credentials.json` with mode `0600`; authentication
requires a non-revoked credential bound to the currently signed-in desktop
account. Every request validates the bearer, while `lastUsedAt` disk writes are
throttled to at most once per credential per 60 seconds.
`VIBYRA_DEVICE_CREDENTIALS_ENABLED=false` rolls new issuance back to
the global `TOKEN`. Existing phones keep global-token compatibility while
`VIBYRA_LEGACY_PHONE_TOKEN_ENABLED` remains enabled, which is the default.

Manual phone disconnect remains session-only: it clears `phoneSession` and
preview capabilities but does not revoke the remembered device credential.
Use the credential-store revocation helper for explicit revocation. Focused
coverage lives in `desktop/lib/deviceCredentials.test.mjs` and
`desktop/lib/pairingCredentials.test.mjs`; tests inject a temporary credential
path through `VIBYRA_DEVICE_CREDENTIALS_PATH`.

## LAN URLs

LAN connection URLs should include only physical phone-reachable addresses. `state.mjs::lanAddresses` filters loopback and virtual interfaces such as Docker bridge, `br-*`, `veth`, VPN/tunnel, and Tailscale-style names so `/health` does not advertise PC-local bridge addresses like `172.18.0.1`.

The phone validates all primary, QR, health-advertised, remembered, and fallback
desktop URLs through `src/utils/desktopUrls.ts`. Strict mode permits only
private/loopback HTTP or exact configured HTTPS relay origins; it rejects
userinfo, paths, public HTTP, encoded IPs, custom schemes, and lookalikes.
`EXPO_PUBLIC_STRICT_DESKTOP_URLS=false` is emergency rollback only.

## Security Review Notes

The desktop server binds to `0.0.0.0` so phones can reach LAN pairing routes, but route trust is split. Keep minimal discovery/pairing routes such as `/health`, `/pair`, and `/pair/status` LAN-reachable; desktop UI/control routes such as `/desktop`, `/desktop/state`, `/desktop/approve`, `/desktop/deny`, `/desktop/quit`, and desktop asset routes are loopback-only through `desktop/lib/desktopUiAuth.mjs`.

`/health` and UDP discovery do not expose `PAIR_CODE`. `/pair` accepts either the manually typed desktop code or `{ autoPair: true }`, then the local desktop user must approve before the phone receives a bearer token.

Desktop pairing is also account-gated. The static desktop shell verifies the real backend account token through loopback-only `POST /desktop/session`, stores only public account identity in process state, and LAN `/pair` rejects requests whose `accountId` does not match the verified desktop account. Health/discovery routes must not expose account identity.

Phone and desktop account IDs are comparable only when both sessions are
verified by the same backend. `desktop/lib/appApiConfig.mjs` resolves explicit
desktop API variables, the app's `EXPO_PUBLIC_API_URL`, or the repo `.env`
before falling back to production, so direct bridge startup cannot silently
use local SQLite while the phone uses production. Diagnose false
different-account errors by checking loopback-only
`/desktop/state.appApiUrl`; do not weaken the numeric account-ID gate.

`/health` may expose only `desktopAccountReady: boolean` so the phone can distinguish "desktop reachable but not signed in" from a network timeout. Do not expose account id/email/name through health or UDP discovery.
