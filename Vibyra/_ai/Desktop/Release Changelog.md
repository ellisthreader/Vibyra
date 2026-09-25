# Desktop - Release Changelog

Every desktop release that reached users, newest first. This is the durable record:
`desktop-tauri/src/lib/changelog.ts` is what the app shows, and this note is
what survives the app. They must agree — `tests/whatsNew.test.mjs` fails the
release gate when the shipping version is missing from either.

Add the entry here in the same commit that adds it to `changelog.ts`, before
the release is built. See [[Mac Setup]] for the publishing steps.

---

## 0.8.10 — 25 September 2026 (Linux; candidate)

Automatic Linux graphics now disables WebKit's DMA-BUF compositor as well as
using the DOM terminal renderer. The 0.8.9 DOM change alone left presentation
latency: native X11 screenshots from the signed package show the prior typed
prefix at 80 ms while DOM mutations already contain the key within 2–48 ms.
The same package with only the compositor changed shows every tested prefix
at 80 ms in Balanced, Full and Best, in Bash and `cat -v` (run `36130658203`).
Independent glyph-pixel comparisons found 55 delayed accelerated frames and
zero mismatches across 198 compatibility frames in that controlled comparison.
Measure from native key receipt; an early capture before input delivery is
inconclusive. Reset PNG page offsets and assert crop dimensions before comparing.
The release gate now captures native OS keys and external X11 screenshots,
with no WebDriver calls between keys, and tests the installed Debian executable
as well as the AppImage. Signed 0.8.10 packaging/publication is pending.

## 0.8.9 — 25 September 2026 (Linux and Mac)

Linux terminal typing could paint one character behind even while the PTY had
received every key. The initial comparison changed both xterm and WebKit renderers, so it did
not isolate the cause. Follow-up diagnosis is recorded under 0.8.10. The release makes Linux
terminals use xterm's DOM renderer under either WebKit graphics mode; Mac and
Windows retain WebGL. Shared Codex terminal writes also use ordered Tauri
dispatch. The native Linux smoke now compares early and settled screen frames
in addition to PTY output. Art: `public/releases/0.8.9.svg`.
Published GitHub tag `v0.8.9` at `7b017a9b` with all 16 signed Mac/Linux
assets: https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.9. Release
run `36120514767` passed Linux AppImage/Deb native smoke and both signed Mac
jobs. Its Linux 50 ms, 150 ms, and 550 ms terminal screenshots are byte-identical
and visibly contain the final `9`; the PTY snapshot contains the same input.
Windows retains the unrelated Unix-assumption fixture failures and was not
published. All four artifacts embed frontend SHA-256
`17511da82a0cd9091599d589406de0df7076fda11507400ee24e9c8325c7afbd`.
The Debian/Ubuntu in-app updater serves 0.8.9 from Railway deployment
`877674a7-2037-49d3-8adb-4eaf02b186aa`. An old-client probe returned
0.8.9, the 0.8.9 probe returned 204, and the actual download matched the
signed CI artifact's 21,104,558 bytes and SHA-256
`9edfb78d4ba1d51050ad990a8bcf0066e814883655af5ac78cb3a5e95b169f9b`.
The AppImage and Mac in-app feeds remain on 0.8.7: the Railway release volume
needs more space for those packages. A human removed backed-up 0.8.5 files;
the obsolete 0.8.8 AppImage still needs removal through Railway's human-only
file browser before staging the 0.8.9 AppImage. GitHub has all four packages.

## 0.8.8 — 24 September 2026 (Linux and Mac)

Codex Terminal's private Unix socket completes its WebSocket handshake in
blocking mode before switching to nonblocking live traffic. This fixes the
broken pipe during `Resuming session…` when the accepted socket is not yet
ready for the upgrade. The isolated real-CLI acceptance reproduced the 0.8.7
failure with Codex 0.156.1 and passes after the fix, including terminal input,
phone input, reattachment and cold resume. Art: `public/releases/0.8.8.svg`.
Published GitHub tag `v0.8.8` at `38428b52` with all 16 signed Mac/Linux
assets: https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.8. Workflow
`36019587299` passed Linux AppImage/Deb native smoke and both signed Mac jobs;
Windows retains eight unrelated Unix-assumption fixture failures. All four
artifacts embed frontend SHA-256
`be1494e46ea173162ecfb4de2087215bc3b1ecab7d49e520e432b6bc1a4db01d`.
The Railway release volume filled during the Debian upload. The 0.8.8
AppImage is stored with a verified remote hash, but the Debian file is partial
and neither Mac archive is stored there. Automatic deletion of obsolete
0.8.5 files was denied with “agents cannot delete files”; current 0.8.7 feeds
remain unchanged. Finish the volume cleanup through a human operation, then
complete the four feed updates and verify old-client offers and current-version
204 responses before calling the in-app rollout live.

## 0.8.7 — 24 September 2026 (Linux and Mac)

Terminal launches recover after an interrupted reply: the app checks the
original native request receipt without dispatching the old settings again,
reveals an already created conversation, and starts the newly requested
terminal with a fresh request ID. If the native store cannot be checked, it
preserves the receipt and shows the underlying error. Art:
`public/releases/0.8.7.svg`. Published tag `v0.8.7` at `4c2c64e5`:
https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.7. Release run
`36010131960` passed the shared frontend, Linux native AppImage/Deb smoke,
and both Developer ID signed Mac jobs. Windows retained eight unrelated
Unix-assumption fixture failures and was not published. Both Mac feeds offer
0.8.7 to 0.8.5 clients; AppImage and Deb feeds offer 0.8.7 to 0.8.6 clients.
All four current-version routes return 204, and download headers match the
signed artifacts' SHA-256 and sizes. The Mac beta remains unnotarized.

## 0.8.6 — 24 September 2026 (Linux)

Published tag `v0.8.6` at `11490e34e90228c1e6310d54ccad0078fe555c3a`:
https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.6. Signed Linux
AppImage and Debian feeds serve 0.8.6. Native WebKitGTK verified the shared
GPT-6 / Claude Opus 5.5 notice, fresh-terminal focus, ordered PTY typing,
Backspace and Shift+Tab. The Linux update also carries the complete 0.8.5
shared desktop workspace, Vibyra AI Chat and Agents. Full artifact hashes,
feed probes, and the separate Windows test limitation are in
`docs/desktop-linux-0.8.6-terminal-incident.md`. Art:
`public/releases/0.8.6.svg`.

## 0.8.5 — 24 September 2026 (Linux and Mac)

Published Linux AppImage and Debian, Apple Silicon and Intel Mac packages from
tag `v0.8.5`. The shared workspace, Agents conversations, project Preview,
terminal responsiveness, sign-in and report recovery shipped. Full publication
evidence is in `docs/desktop-0.8.5-linux-mac-release-plan.md`. Art:
`public/releases/0.8.5.svg`.

## 0.8.2 — 23 September 2026 (Linux)

Published Linux AppImage and Debian update, tag `v0.8.2`. Transient Google
sign-in recovery, authenticated bug report delivery after a failed readiness
check, and project right-click rename/close were verified in native Ubuntu
WebKitGTK smoke. Art: `public/releases/0.8.2.svg`.

## 0.8.1 — 23 September 2026 (Linux)

Published Linux AppImage and Debian update, tag `v0.8.1`. Restored ordered,
responsive PTY typing, Backspace and Shift+Tab, native Linux decorations, and
report UI entry. Art: `public/releases/0.8.1.svg`.

## 0.8.0 — 23 September 2026 (Linux)

First signed Linux AppImage and Debian release with shared desktop presentation,
Linux native adapters, updater and package smoke. Tag `v0.8.0`; its release art
is `public/releases/0.8.0.png`.

## 0.7.9 — 22 September 2026

Signed local Agents update installed as build 9; native acceptance is recorded in
`docs/desktop-agents-completion.md`. Not a published updater release.

- Compact roster, bounded conversations, inline decisions and minimal composer.
- Provider, skills, memory and budget configuration; durable account-scoped drafts.
- Exact send recovery, balance refusal recovery, full history pagination and preserved scroll.

## 0.7.8 — 22 September 2026

Commit `91d7615a0b1c` · run `35662386678` · art `public/releases/0.7.8.svg`

Signing in, signing out, and the account your agents actually use.

- **Two-step sign-in.** Accounts with two-factor authentication can complete
  sign-in on the Mac; the code can be submitted or backed out of, instead of
  stranding the screen.
- **Signing out actually ends the session.** Signing this Mac out from Devices,
  or deleting the account, returns to the sign-in screen rather than leaving the
  window in a session that no longer exists.
- **One account's terminals never reach the next.** The saved session — which
  holds the departing account's terminals and, with scrollback saving on, their
  output — is discarded on sign-out.
- **Launch setup shows the account it will use.** A project that picked its own
  provider account can no longer start under a different one.
- **App notices stop collapsing into a count.** System notices are separate
  sentences, so two arriving together no longer become "2 app notices".

## 0.7.7 — 21 September 2026

Commit `1b5cb491caa0` · run `35630896716` · art `public/releases/0.7.7.svg`

A quieter updater, and the What's New window.

- **One update notice, not three.** An update announced itself as a banner plus
  two sticky toasts, all overlapping in the same corner. One card now, which
  tracks the download and stays until it is closed.
- **You can see what changed.** Every update opens the What's New window once,
  from a changelog that travels inside the build it describes.

## 0.7.6 — 21 September 2026

Commit `e65fefb1798d` · run `35624679035` · no art (predates the ritual)

First Mac release since 0.1.10 on 9 September, and the first signed with a real
Developer ID certificate rather than ad-hoc — so Screen Recording and microphone
permissions now survive an update instead of needing re-granting each time.

Carried months of accumulated work: the Workspaces sidebar keeping every project
in view, the redesigned Settings, dictation in chat, and shared Mac-to-iPhone
conversations.

## 0.1.10 and earlier

Published before this log existed. 0.1.10 (9 September) added IPv6-only network
support for the iPhone connection; 0.1.9 introduced it. All ad-hoc signed.
