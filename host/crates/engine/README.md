# Host execution engine

This crate runs independently of the Tauri window. `Engine` owns the existing
`vibyra-core::pty::PtyManager`; network connections borrow the engine and release
only their control leases when they disconnect. Shells, provider CLIs, Git,
builds, and tests execute on the computer. The phone renders output and sends
explicit input. Provider login files remain with the installed CLI; inherited
automation API-key variables are removed from launched sessions.

The transport must authenticate a locally approved device before calling
`handle`, subscribe before requesting snapshots, and disconnect a client whose
event receiver overflows. Input and terminal dimensions require the current
device's lease and the session generation. Input receipts acknowledge queue
acceptance, not shell execution: never automatically retry an uncertain command
with a fresh ID. Session creation receipts are committed in SQLite before process
launch, so reconnect/restart retries cannot launch duplicate work.
An OS file lock rejects a second host instance using the same state directory
before it can relabel running sessions or alter the execution journal.

Local configuration approves project roots and optional project/loopback preview
ports. `cap-std` directory capabilities constrain file reading and listing,
including symlink traversal; binary/special files and escaping paths are rejected.
Git review disables external diff/text conversion, filesystem monitors, and
interactive prompts. Preview fetches only approved `127.0.0.1` ports, performs GET,
disables proxies and redirects, and bounds responses. Remote requests cannot add
roots or preview ports. See the maintained capability API at
<https://docs.rs/cap-std/latest/cap_std/fs/struct.Dir.html>.

Trusted shell control is a powerful computer capability. A working directory is
**not an OS sandbox**: a trusted person can type commands that access other files
or run programs with the host user's privileges. Pairing must state this before
trust is persisted. This engine does not scrape prompts, classify shell commands
as safe, or auto-approve provider actions. Codex launches with `workspace-write`
and `on-request`; Claude launches with its installed normal interactive permission
mode (`manual`, or `default` on versions advertising that spelling). Their native
permission prompts remain visible and actionable in the real terminal.

Protocol 1 intentionally has concrete limits: 12 active PTYs; 8 KiB UTF-8 event
chunks and retained reconnect tail; 8 KiB text/diff responses; at most 250 directory
entries within a 48 KiB response; 32 KiB static preview bodies; 65,536 input receipts
per generation. Responses state truncation where applicable. Core output overflow
emits `terminal.resync`, rotates the generation, and requires a snapshot and fresh
control claim. Large interactive preview sites, HMR, cookies, and WebSockets need
a separate authenticated preview streaming protocol; `preview.fetch` is a bounded
static fetch and must not be presented as a complete browser tunnel.

Host state includes at most one bounded page of session metadata, prioritizing
running sessions, with `sessionCount` and `nextCursor`. Use `session.list` with
that cursor to load older sessions; both routes remain below the frame limit even
after hundreds of historical sessions have accumulated.

Closing a phone or Tauri window does not stop this separately running host.
Stopping/rebooting the host interrupts its PTYs. On restart, durable session
metadata says `interrupted`; no live process, output history, successful outcome,
or resumable provider conversation is fabricated. Historical create receipts
remain durable; terminal input receipts and output are intentionally in memory.

Run the focused Linux/macOS PTY suite and cross-platform filesystem/preview suite:

```sh
cargo +1.97.1 test --manifest-path host/Cargo.toml -p vibyra-host-engine
cargo +1.97.1 clippy --manifest-path host/Cargo.toml -p vibyra-host-engine --all-targets -- -D warnings
node host/crates/engine/check-lines.mjs
```

The tests execute real local shells, Git, and loopback HTTP fixtures. They do not
use paid provider calls or establish iPhone/Windows/macOS runtime certification.
