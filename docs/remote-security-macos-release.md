# Remote access security Mac release candidate

Version: 0.8.16, bundle build 29.

## Source baseline

The baseline preserves the installed 0.8.15 build 26 source from the local assembled Mac build, frozen as commit `e9b5073f`. Its built executable SHA-256 is `f9daf1c2e54d7f689ec25930992afe86ad72cacd6cab9a791c53dec46803ea57`. Installed version and published updater version are separate: the live Apple Silicon feed still offered 0.8.7 when preparation began.

The security overlay adds signed account/generation/device-bound remote leases, device possession challenges, separate permissions, passkey and local owner approval integration, keychain-backed Host identity, independent restrictive synchronization, session revocation, visible active-session controls, and native WebView IPC containment. The installed shared conversation, project-window Preview and CLI launch features remain in the baseline. Unrelated Agent VM, plan-limit, focused-text, saved-pane and Bonjour pilot changes from the dirty working tree are excluded.

## Release gates

The signed Mac workflow builds one frontend archive and checks it against each native package. Both architectures run line limits, dead-code checks, Node tests, TypeScript/Vite build, Rust formatting, Clippy with warnings denied, workspace tests, Host tests, and the real native untrusted-frame IPC fixture. Packaging verifies the existing Developer ID identity, entitlements, helper and launch, and requires a Tauri updater signature.

Local frontend checks passed: 553 Node tests, one skipped, TypeScript/Vite build, line limits and dead-code. The security UI fixture passed in light and dark themes. Artwork is a new self-contained SVG, visually reviewed. Native validation and signed artifacts are recorded in the workflow run.

This candidate does not install itself or publish the live updater feed. The existing Mac beta workflow has Apple Developer ID and updater credentials; notarization credentials are not configured. Do not describe this as notarized.
