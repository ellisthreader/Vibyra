# Native Remote Input Authorization

Window Preview control belongs to one exact HTTP Stream, local window grant,
active account, published project root, Binding and Session token. Capture a
`WindowConsent` from the initial fully validated binding; it stores the complete
immutable Grant and current project root. Event-time checks compare that exact
snapshot without native inventory or filesystem calls.

`preview_service/window_input.rs` rechecks the Stream's screen/input permission,
local consent, current Binding→Session identity and typing switch. Use nonblocking
workspace/consent/binding/typing snapshots: busy state denies input. Recheck the
exact Stream after snapshots. This prevents stale leases after lock waits and
avoids recursively acquiring Linux's X11 connection mutex through target.info.

`window_preview/session.rs` rechecks after its sequence wait and verifies the
same token before every effect. Close takes/removes the token before native stop,
then releases its mutex. A queued old request cannot borrow renewed consent.

Mac carries a borrowed synchronous C callback plus opaque context through Swift;
the predicate is Sync, catches panics and rejects missing context. Never put that
context in JSON/IPC or retain it on asynchronous queues. Windows/Linux receive the
same explicit predicate. Unscoped input dispatch denies by default.

Check before activation/window movement, pointer movement, down/scroll and every
key/text piece. Cleanup may emit only a release paired with a successfully emitted
down, plus restoration of an X11 key mapping borrowed by that request. Revocation
must prevent every subsequent new input effect.

Use the VibyraOptimse skill for permission/timing audits. Regression routes:
`cargo test --manifest-path desktop-tauri/src-tauri/Cargo.toml input_guard` and
`window_consent`; the Mac test compiles actual Keys.swift expansion with an
injected sink and posts no OS events. Keep queue revoke/close zero-effect tests,
mid-repeat/text revocation, callback thread-hop/panic/null denial, busy consent,
reapproval/account/workspace/wrong-device/view-only denial and paired cleanup.

These are source and automated checks. Signed Mac releases and native Windows/
Linux acceptance still need the exact release validation workflows.
