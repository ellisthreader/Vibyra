---
name: vibyra-expo-web-diagnostics
description: Diagnose Vibyra mobile Expo Go and web startup, native bundle failures, wrong-version launches, account discovery, and mobile API reachability.
---

# Vibyra Expo Diagnostics

## Source and memory

Read the memory protocol, Context Map, Project Context, Vibyra App Memory and
`App/iOS Remote Workspace.md` before exploring. The sole mobile app is
`mobile/` (SDK 57), starting at **Build from your pocket.** The old root Expo
client and older companion welcome screen are retired. Do not reconstruct them.
Settings > Show welcome again returns to the first screen.

If the expected UI is missing, inspect the running listener's working directory
and the checkout's dirty/untracked mobile files. The confirmed latest app was
preserved from `/home/ellis/Desktop/Vibyra-iOS/mobile`; a release commit or
serving-worktree name alone did not include that work. Verify actual files.

## Launch

From the repository root:

```bash
npm ci --prefix mobile
bash host/scripts/build-wasm.sh
npm run phone
```

The asset preflight needs `host/generated/noise/vibyra_transport_bg.wasm`.
The build script pins Rust 1.97.1 and wasm-bindgen 0.2.127. Root start/dev/web/ios
commands delegate to mobile; there is no root Expo project.

Check existing listeners before choosing a port. For an alternate port, run
`npx expo start --go --lan --port <port>` in mobile after building assets.
Use `--go` explicitly because expo-dev-client is also installed. Keep Metro
running outside bounded launch commands (detached with logs under `/tmp`).
Never stop another project's listener merely to reuse its port.

If Expo Go asks for CLI sign-in, check `expo whoami` in mobile first. Preserve
an existing matching account and restart an offline Metro online before
investigating account discovery. CLI identity alone does not prove the phone's
server list is updated. Direct LAN access is a separate verification path.

Before sharing a QR, verify the route and listener address family. IPv6-only
Macs can expose 192.0.0.2 through CLAT; it is not a phone-reachable LAN address.
Never advertise it or treat localhost-only Simulator Metro as a phone server.
For desktop terminal invitations, read `Desktop/iPhone Connection.md`: Mac
0.1.10 and the matching mobile parser support explicit direct LAN IPv6 pairing.
Use the current interface, bracket IPv6 URLs, and preserve Noise/pinned-key
checks. For Expo, verify the actual advertised launch URL is phone-reachable:

1. `/status` returns `packager-status:running`.
2. The iOS manifest is 200 and identifies the intended project/SDK/LAN host.
3. Its native `launchAsset.url` is 200 JavaScript; warm this bundle first.

## Mac iPhone simulator

Use the existing Expo app with Xcode's Simulator and Expo Go; do not create a
parallel SwiftUI starter. First check `xcrun simctl list runtimes`; an installed
Xcode SDK does not mean its simulator runtime is installed. Download a missing
runtime with `xcodebuild -downloadPlatform iOS`.
For simulator-only Metro use `NODE_OPTIONS=--dns-result-order=ipv4first npx expo
start --go --localhost --port 8081`, then open iOS. The IPv4 preference avoids
Node 24 binding localhost only on ::1 while Expo advertises 127.0.0.1. Verify
the manifest's exact launchAsset URL returns JavaScript. Keep CI unset because
Expo CI mode disables reloads/Fast Refresh. React Native screens update through
Metro Fast Refresh, not the SwiftUI preview canvas.

## Failures

A bundle returned as application/json is usually a Metro error, not a MIME
configuration problem. Fetch its body and fix the reported import/asset failure.
For corrupt raster assets, validate the bytes and decoder output before clearing
caches. A file extension does not prove the data is valid.

Keep native-only modules behind platform variants. Browser pairing keys stay
memory-only; native trust uses SecureStore. Do not weaken trust or approval
checks to make a preview work. For account failures inspect
`mobile/src/account/` and the configured `extra.apiUrl`; account APIs and Host
pairing are separate paths. Host pairing does not require an account.

## Computer discovery

For native Host connection failures, inspect `transport/RuntimeBridge.tsx`.
WKWebView blocks local `ws://` from an HTTPS document even when Android's
`mixedContentMode` is set. The iOS hidden runtime uses `http://localhost` as
its document origin; Noise encryption, pinned Host keys and pairing still apply.
Verify with `mobile/scripts/verify-native-conversation.mjs`: browser transport
tests cannot detect this native origin failure. Use its isolated fixture manifest
without replacing App.tsx or stopping the user's Metro server.

Read `App/Computer Connection.md`. The local Expo module uses NWBrowser and
cannot run in Expo Go/web; require a development build and verify autolinking
plus NSBonjourServices/NSLocalNetworkUsageDescription. Never start a browse on
mount, installation confirmation or Settings return. Check explicit search,
denial, retry, empty/found results and cancellation on close/background;
iOS's inactive permission-alert state must not stop it. Use a physical phone
for Local Network consent (Simulator does not enforce it). Test against a LAN
Host launched with `--discover`; Bonjour presence never replaces invitation/Host
approval. Run `verify-connection-ui.mjs` for both-theme compact/wide layout
checks. Keep custom Swift files in the mobile line gate.

## Verification

For mobile account UI/provider changes, read `App/Account Sign In.md` and run
`npm --prefix mobile run verify:auth-ui`. It checks phone/desktop sizes and both
themes with fixture-backed auth; real provider completion needs separate device
evidence. Native Apple and Apple browser OAuth have separate configuration.
Use `CHROME_PATH` to override the focused harness's Mac Chrome default.

Run `npm run check:mobile`, `npm --prefix mobile run export`, and the focused
browser or Host UI harness when appropriate. `scripts/mobile-entrypoints.test.mjs`
prevents the retired root app and a second mobile welcome screen from returning.
Physical-phone acceptance and native store signing require separate evidence.
Update `App/iOS Remote Workspace.md` for durable launch or diagnostic findings.
