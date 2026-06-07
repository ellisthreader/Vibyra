# Desktop - Pairing And Phone Session

Read this for pairing requests, phone session state, bearer tokens, `/health`, and LAN URL discovery.

## Files

- `desktop/lib/pairingHandlers.mjs`
- `desktop/lib/state.mjs`
- `desktop/lib/discovery.mjs`
- `desktop/lib/routes.mjs`

## Pairing Flow

`desktop/lib/pairingHandlers.mjs` owns pair-code validation, pending pair state, desktop approval/denial, token handoff after approval, project discovery on approval, and preview-start responses.

`desktop/lib/state.mjs` generates `PORT` (default `4317`), `PAIR_CODE`, `TOKEN`, and LAN connection URLs.

Pairing requests are idempotent per phone attempt. The phone sends a `requestId` with `/pair`; desktop stores it as `clientRequestId` and returns the existing pending/approved request for duplicate posts. This prevents LAN scans across multiple URLs from replacing the request ID the phone is polling.

Desktop approval marks the request approved before project discovery so slow filesystem scans do not keep the phone stuck waiting.

## Phone Session

Phone connection state is session-based, not only approval-based. Authenticated phone routes call `markPhoneConnected`; `/desktop/state` and `/health` derive `pairedDevice` from recent `phoneSession.lastSeenAt`.

Authenticated `POST /desktop/disconnect` clears the desktop-side phone session when the phone disconnects.

Bearer tokens are stable across desktop restarts. `state.mjs` reads `VIBYRA_AGENT_TOKEN` first, otherwise persists a generated token at `~/.vibyra-agent/desktop-token`.

## LAN URLs

LAN connection URLs should include only physical phone-reachable addresses. `state.mjs::lanAddresses` filters loopback and virtual interfaces such as Docker bridge, `br-*`, `veth`, VPN/tunnel, and Tailscale-style names so `/health` does not advertise PC-local bridge addresses like `172.18.0.1`.

## Security Review Notes

The desktop server binds to `0.0.0.0` so phones can reach LAN pairing routes, but route trust is split. Keep minimal discovery/pairing routes such as `/health`, `/pair`, and `/pair/status` LAN-reachable; desktop UI/control routes such as `/desktop`, `/desktop/state`, `/desktop/approve`, `/desktop/deny`, `/desktop/quit`, and desktop asset routes are loopback-only through `desktop/lib/desktopUiAuth.mjs`.

`/health` and UDP discovery do not expose `PAIR_CODE`. `/pair` accepts either the manually typed desktop code or `{ autoPair: true }`, then the local desktop user must approve before the phone receives a bearer token.

Desktop pairing is also account-gated. The static desktop shell verifies the real backend account token through loopback-only `POST /desktop/session`, stores only public account identity in process state, and LAN `/pair` rejects requests whose `accountId` does not match the verified desktop account. Health/discovery routes must not expose account identity.

`/health` may expose only `desktopAccountReady: boolean` so the phone can distinguish "desktop reachable but not signed in" from a network timeout. Do not expose account id/email/name through health or UDP discovery.
