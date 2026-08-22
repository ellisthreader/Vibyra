# Current Tasks

Last updated: 2026-08-22

Scope: Vibyra only. Other projects track their own state in `01 Projects/<project>/`.

## Now

- **Desktop integrations — multiple accounts per provider.** Add/disconnect/switch additional accounts for Codex, ChatGPT, Claude, and Google, applied live in a running terminal. See `Desktop/Desktop Shell.md`.
- **Integration account details.** Logging in through Settings > Integrations succeeds but does not surface the account email or membership plan underneath. Diagnose and fix.
- **In-app bug reporting.** Report flow posts to a Discord webhook with screenshot, location, and the reporting user attached. Verify attachments and reporter identity land in Discord.

## Next

- **Make the in-app updater real.** It is currently built but inert: the shipped build lacks the updater plugin, signing variables are unset, and the release workflow was never pushed. Do not tell users updates arrive in-app until this is fixed. See `Desktop/Rust Tauri Desktop.md`.
- **Auto-save/resume edge case.** Restoring a workspace with an empty chat raises an error; restore is otherwise working.
- **Website downloads page.** Keep it aligned with the current beta build and the one-command Linux install.

## Watching

- OpenRouter model announcements post to Discord automatically. Confirm new releases still arrive after OpenRouter API changes.
- Periodically fold useful `_ai/Runs/` facts into durable notes, then let the run notes go.

## Recently Done

- Terminal auto-save and resume across app restarts.
- Terminal performance overhaul (WebKit compositing; see `Desktop/Tauri Terminal Performance Overhaul.md`).
- Screenshot capture (F9) rework: fullscreen toggle, X11 handshakes, full-resolution frames.
- Account authentication and keyring session storage for the Tauri desktop app.
- Old Electron desktop app removed from the repo and the machine.
