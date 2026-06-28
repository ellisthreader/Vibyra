# Windows Support Notes

## 2026-06-28 Terminal PTY Fix

Codex terminals were failing on Windows with:

```text
Error: stdin is not a terminal
```

The cause was that Vibyra launched native AI CLIs through normal `stdin`/`stdout` pipes. That is enough for simple child processes, but Codex expects a real terminal and exits when `stdin` is not attached to a TTY.

The fix added a Windows ConPTY-backed launch path using `node-pty` for native AI provider CLIs such as Codex. Shell terminals and the bundled Vibyra Agent keep their existing Windows launch paths because they already work without this TTY requirement.

Follow-up UI smoothing:

- Disabled the blinking xterm cursor in Vibyra terminal panes.
- Changed PTY snapshot sync to append missing output when possible instead of resetting and replaying the whole terminal buffer.
- Kept full replay only for genuinely divergent snapshots.

Verification:

- Focused terminal tests passed on Windows.
- A live Codex terminal launched inside Vibyra without the `stdin is not a terminal` error.
- The live terminal reached Codex's own interactive prompt, confirming it had a real terminal.
