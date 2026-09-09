# Desktop iPhone Connection

Mac 0.1.9 adds Settings > iPhone connection. The desktop embeds the existing
Host Noise/WebSocket transport through the optional-engine `vibyra-host`
library, with a desktop-specific read-only Backend. It serves the same
PtyManager sessions as the Mac frontend; no second CLI or chat is created.

Sharing defaults off. The user enables a Wi-Fi/private VPN interface on port 4319,
then scans the expiring, single-use QR/link in the maintained iOS app's
Computers connection screen. Approval happens in Mac Settings. Trusted device
keys persist in the private `phone/identity.json` alongside desktop settings;
connection enable/address preferences persist separately. Reconnect uses saved
trust; device revocation closes access immediately. Turning sharing off closes
all sockets through the embedded runtime. Desktop restart retains trust but
assigns a new stream generation. Invalid saved interfaces show a retryable error.

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
- Desktop `SettingsPhonePane.tsx`: enable, QR/link, pending approval, revoke.
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

Mac 0.1.10 selects a valid IPv4 or IPv6 route. A CLAT address such as 192.0.0.2
is not phone-reachable and must not be advertised. `phone/address.rs` falls
back to IPv6; Settings > Use current network refreshes a changed interface.
`examples/phone_address_probe.rs` verified that this Mac selects IPv6. Avoid
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
