# Desktop - Release Changelog

Every desktop release that reached users, newest first. This is the durable record:
`desktop-tauri/src/lib/changelog.ts` is what the app shows, and this note is
what survives the app. They must agree — `tests/whatsNew.test.mjs` fails the
release gate when the shipping version is missing from either.

Add the entry here in the same commit that adds it to `changelog.ts`, before
the release is built. See [[Mac Setup]] for the publishing steps.

---

## 0.8.6 — 24 September 2026 (Linux)

Linux parity and terminal-focus correction, built from the shared Mac/Linux
desktop source. The new-models launch notice, Vibyra AI Chat and Agents
workspace are included; new terminals now take keyboard focus immediately.
Publishing and native acceptance are tracked in
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
