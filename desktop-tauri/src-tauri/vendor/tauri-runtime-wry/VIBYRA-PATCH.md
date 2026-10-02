# Vibyra tracing dispatch patch

Pinned upstream tauri-runtime-wry 2.11.4, crates.io checksum recorded in
VIBYRA-PATCH.json. MIT/Apache licenses and source attribution are retained.
Only src/lib.rs differs from upstream: tracing-enabled eval_script and
eval_script_with_callback enqueue their existing event/span/callback through
send_user_message instead of waiting for a main-thread acknowledgement.
This matches the asynchronous non-tracing contract. The event still owns the
span, and callback execution remains on the evaluated result. The acknowledgement Sender and its send/unwrap are removed from both
tracing message variants and handlers; neither a waiting receiver nor a
failed-send panic remains. No IPC keys, filtering or permissions change.

Tauri tracing must stay enabled: disabling it restores an upstream eprintln
that can reveal the native invoke key. Keep native_logging filtering and the
real IPC secrecy/ACL fixture. Run verify-native-event-dispatch.py to prove
background event/eval/callback enqueue during occupied main-thread IPC, plus
actual JavaScript event/evaluation/callback delivery. Unpatched 2.11.4 hangs
on this schedule; the fixture watchdog exits only its own process.

Review this patch against upstream before changing the Tauri runtime version.
