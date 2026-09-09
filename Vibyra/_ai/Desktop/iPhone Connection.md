# Desktop iPhone Connection

Mac 0.1.9 adds Settings > iPhone connection. The desktop embeds the existing
Host Noise/WebSocket transport through the optional-engine `vibyra-host`
library, with a desktop-specific read-only Backend. It serves the same
PtyManager sessions as the Mac frontend; no second CLI or chat is created.

Sharing defaults off and is one switch. Turning it on detects this Mac's own
Wi-Fi/VPN address, binds port 4319 and advertises `_vibyra-host._tcp` under the
machine's hostname. Nobody types an address: `phone/watch.rs` re-detects every
six seconds, rebinds after a Wi-Fi, VPN or IPv6 privacy-address change, and
starts a connection that could not bind earlier, so a failed start leaves the
switch on rather than erroring at the person. Only `{"enabled":true}` persists;
a saved address would go stale.

The iPhone then finds this Mac over Bonjour and may ask to connect with no code
at all: the embedded host sets `Shared.nearby` whenever it advertises (any
non-loopback address), so an invite-less `Hello` enters the same pending queue.
`PhoneApprovalModal` is mounted in `WorkspaceApp`, not Settings, so Allow
viewing/Deny is answerable wherever the person is working inside the phone's
85-second wait. The expiring single-use QR/link remains the fallback for a phone
that cannot find it, tucked under "If your phone cannot find this Mac" for
networks that block Bonjour and for Expo Go/web builds. Approval always happens
on the Mac; nearby pairing never grants trust on its own. See
[[App/Computer Connection]] for the phone side. Trusted device keys persist in
the private `phone/identity.json` alongside desktop settings. Reconnect uses
saved trust; device revocation closes access immediately. Turning sharing off
closes all sockets through the embedded runtime and stops the advertisement.
Desktop restart retains trust but assigns a new stream generation.

This is viewing, not remote terminal control. The server rejects session
create/input/resize/stop, filesystem, preview and approval mutation requests.
Pairing grants visibility into all current/future desktop terminal output;
there is no per-project grant. It does not export provider credentials or
account state, but credentials printed inside a terminal are part of its output.
Mac and phone must share Wi-Fi or a private VPN, and Mac must stay awake with
Vibyra running. This does not configure a public Internet relay or port forward.

Ownership:
- Desktop `src-tauri/src/phone/`: private interface validation, persisted service,
  read-only Host contract and desktop session adapter.
- Core `pty/remote.rs`: independent bounded UTF-8 tail with exact byte offsets;
  phone snapshots do not consume desktop output. Polling emits output or resync.
- Host `server/src/{backend,embedded}.rs`: shared authenticated transport lifecycle.
- Desktop `SettingsPhonePane.tsx` + `PhoneFallback.tsx`: the switch, live
  discoverability state, allowed phones, and the code path for blocked networks.
- Desktop `state/phoneStore.ts`, `lib/usePhoneWatch.ts`, `phone/PhoneApprovalModal.tsx`:
  one polled status the workspace shares, so a request is answerable anywhere.
  Selectors must return stored references; a fresh array per render loops React.
- Host `EmbeddedHost::start` takes the advertised computer name; the desktop
  passes its hostname so a phone lists the Mac, not the product.
- Mobile `SessionScreen`, `SessionDetails`, `state/session.ts`: honor Session
  `readOnly`; older clients remain protected by server rejection.

Validation: full desktop verify; core split-UTF-8/truncation test; a real existing
PTY stream and mutation-rejection test; embedded real-WebSocket encrypted
pair/reconnect/revoke/shutdown test; existing standalone Host auth tests; mobile
read-only stream/control-dispatch regression, typecheck/tests/line gate. Browser
review covers the real Mac settings component with mock IPC. Physical iPhone
LAN permissions, QR scanning and reconnect still need device validation.

The desktop format gate now traverses shared Host path dependencies, including
the optional engine. Validate the exact release checkout; formatting only the
local tree can miss unstaged shared dependencies. Do not pull unrelated mobile
conversation/billing changes into a desktop release to satisfy a format diff.

The local `plan` skill routes desktop-to-phone work to this note and requires
existing-PTY, approval, reconnect/revoke and exact-release-checkout validation.

## IPv6-only Mac networks

Address detection is now automatic; Settings has no address field and no
"Use current network" action. Mac 0.1.10 selects a valid IPv4 or IPv6 route. A CLAT address such as 192.0.0.2
is not phone-reachable and must not be advertised. `phone/address.rs` falls
back to IPv6; Settings > Use current network refreshes a changed interface.
`examples/phone_address_probe.rs` verified that this Mac selects IPv6, and
`examples/phone_discovery_probe.rs` starts a scratch connection on an ephemeral
port and browses with Apple's `dns-sd` — the stack `NWBrowser` uses — proving a
phone on this network finds the Mac by name. Avoid
persisting a particular observed address in instructions: privacy addresses
can change. A stale saved address produces a retryable connection error.

IPv6 URLs use brackets. Invitations explicitly carry `network: lan` and
`route: direct`; the maintained phone parser requires both before accepting
a globally allocated/ULA IPv6 `ws` URL. Noise encryption and pinned Host keys
remain mandatory. The embedded Host rejects IPv6 peers outside the listener's
/64 before the handshake. Public IPv4/DNS/relay still require `wss`, and scoped
link-local, mapped IPv6 and CLAT addresses are rejected. IPv4 private VPN
100.64/10 is accepted by both sides. IPv6 VPN peers must share the selected /64.

Regression coverage includes real encrypted IPv4/IPv6 pair, reconnect, revoke
and shutdown; address and peer-policy cases; and mobile invitation parsing.
The native Chrome component fixture verified Use current network and the full
IPv6 field layout; its mock IPC does not establish physical phone acceptance.
The Mac file-watcher test waits for its target file until one fixed deadline,
because an unrelated directory setup batch may arrive first. Keep the watcher
assertion meaningful; do not assume the first delivered batch is the target.
The current `mobile/` SDK 57 native bundle contains the parser fix. Its running
Metro is localhost-only for Simulator; that does not establish phone LAN
reachability. Older phone bundles need updating/reloading for IPv6 invitations.
The Expo diagnostics skill covers this route-family and launch-scope distinction.

## Published checkpoint — September 9, 2026

Mac 0.1.9 is live for Apple Silicon and Intel through the existing updater.
Artifact source: `f27e75f87c341c35fa23622ff998d801f614ba28`; successful CI run `34340294415`.
Railway deployment: `62deaf29-3951-4701-8043-cf2c392e56ea`. Both actual HTTP downloads passed byte count,
SHA-256 and configured updater-key signature checks. Feeds offer 0.1.9 to
0.1.7/0.1.8 clients and 204 to current/newer clients; installer catalogue and
health checks passed. Physical phone pairing and installed-app launch remain
user-device checks. The local iOS source honors read-only sessions; no iOS
store release was performed. A later installed-app check confirmed 0.1.9 is
running on this Mac with the user's active terminals; keep that host running.

## IPv6 release checkpoint — September 9, 2026

Mac 0.1.10 is live for Apple Silicon and Intel and supersedes 0.1.9.
Artifact source: `14a91580548458aa8697dbd8a2597bfcefb7ef38`; CI run `34356437880`
passed both full desktop gates, encrypted transport checks and native launches.
Railway deployment `eb205a7c-869c-4575-9f71-309465df027e` succeeded with the
existing CLI snapshot provenance. Archives are under
`releases/macos/0.1.10-14a915805484/{arm64|x64}`.

Both actual HTTP downloads passed size, SHA-256 and configured updater-key
signature verification. Feeds return 0.1.10 to 0.1.7/0.1.8/0.1.9 and 204 to
0.1.10/newer; production health and unchanged installer catalogue passed.
The local Mac remained running on 0.1.9 to preserve the user's active terminals.
Install through Download > Restart now, then Settings > iPhone connection >
Use current network > Enable connection. Create a QR/link and approve the
phone's viewing request on the Mac. Matching mobile IPv6 parser changes are in
the maintained app source/current local bundle; no iOS store release was made.
Physical iPhone consent, pairing and reconnect remain device acceptance checks.
