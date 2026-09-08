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

Before sharing a QR, use the active default-route LAN IPv4 and verify:

1. `/status` returns `packager-status:running`.
2. The iOS manifest is 200 and identifies the intended project/SDK/LAN host.
3. Its native `launchAsset.url` is 200 JavaScript; warm this bundle first.

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

## Verification

Run `npm run check:mobile`, `npm --prefix mobile run export`, and the focused
browser or Host UI harness when appropriate. `scripts/mobile-entrypoints.test.mjs`
prevents the retired root app and a second mobile welcome screen from returning.
Physical-phone acceptance and native store signing require separate evidence.
Update `App/iOS Remote Workspace.md` for durable launch or diagnostic findings.
