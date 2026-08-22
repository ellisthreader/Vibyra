# Desktop - Rust Tauri First Welcome

Read this for the one-time welcome shown after a Vibyra account first enters the
new native `desktop-tauri/` workspace on a computer.

## Product Contract

- Mount over the already-running authenticated workspace; never add an
  onboarding route or remount shell, project, or PTY nodes.
- Open with `Welcome to Vibyra, <first name>.`, then show concise beats for
  choosing work, using one focused agent or a coordinated team, and building on
  desktop while reviewing from phone. Four 1.6-second beats finish at 6.4
  seconds and hold on one `Start building` action.
- Keep the canonical cobalt V, oversized text, a quiet progress hairline, and
  one-shot Graphite/Cobalt motion. Skip and Escape remain available. Reduced
  motion is a static personalized summary with no timers.
- Show once per account on this desktop. Do not add a manual replay control.

## Ownership And Persistence

- `src/components/auth/FirstWelcome.tsx`: playback generation guard, focus
  trap, reduced-motion path, dismissal, and launch-control handoff.
- `src/lib/firstWelcomePolicy.ts`: copy, exact timing, bounded
  `vibyra.desktop.firstWelcomeSeenAccounts` storage, and account checks.
- `src/components/layout/WorkspaceApp.tsx`: mounts the overlay only after
  settings and the authenticated workspace are ready.
- `src/styles/first-welcome.css` and `first-welcome-motion.css`: responsive
  composition and one-shot motion.
- `src-tauri/src/account_types.rs`: derives renderer-safe `welcomeKey` from the
  backend account identity. It is stable across profile edits and exposes no raw
  account id or credential; renderer storage uses only this opaque scope.

## Validation

Run `npm --prefix desktop-tauri run verify`. It covers the 200-line gate, Knip,
focused welcome policy/source tests, TypeScript/build, rustfmt, Clippy with
warnings denied, and all Rust tests. Also inspect the live native window; the
first implementation review caught and fixed word spacing plus an exposed
screen-reader-only status line that source checks did not reveal.
