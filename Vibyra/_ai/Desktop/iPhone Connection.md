# Desktop iPhone Connection

Mac 0.1.9 adds Settings > iPhone connection. The desktop embeds the existing
Host Noise/WebSocket transport through the optional-engine `vibyra-host`
library, with a desktop-specific read-only Backend. It serves the same
PtyManager sessions as the Mac frontend; no second CLI or chat is created.

Sharing defaults off. The user enables a private IPv4 interface on port 4319,
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

## Published checkpoint — September 9, 2026

Mac 0.1.9 is live for Apple Silicon and Intel through the existing updater.
Artifact source: `f27e75f87c341c35fa23622ff998d801f614ba28`; successful CI run `34340294415`.
Railway deployment: `62deaf29-3951-4701-8043-cf2c392e56ea`. Both actual HTTP downloads passed byte count,
SHA-256 and configured updater-key signature checks. Feeds offer 0.1.9 to
0.1.7/0.1.8 clients and 204 to current/newer clients; installer catalogue and
health checks passed. Physical phone pairing and installed-app launch remain
user-device checks. The local iOS source honors read-only sessions; no iOS
store release was performed. The current desktop host was left running on 0.1.7.
