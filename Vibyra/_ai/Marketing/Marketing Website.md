# Marketing Website

The public Laravel homepage is `backend/resources/views/marketing.blade.php`
and `backend/resources/js/marketing/App.jsx`. Its current sections live in
`marketing/home/`; the single `marketing.css` entry imports `home-*.css`.
Older scroll-film and overview components are retained source, not mounted.
The September 2026 redesign replaces the previous short scroll-film direction
at the user's request for comprehensive software and phone coverage.

`WorkspaceTour.jsx` provides the expanded, readable Build/Preview/Review demo
using a native modal dialog. Keep the miniature as a product composition;
small-screen viewport controls belong in the expanded tour. Dialog opening and
scroll-lock cleanup use layout effects; keyboard focus loops inside, and
Escape/backdrop dismissal restores the opener. Scrollable review/code regions
are focusable. `GettingStarted.jsx` owns the audience switch and matching first
project steps. Marketing body copy is sized separately from miniature UI text.

## Product and copy

- Lead with vibecoders turning ideas into real software; show developers real
  terminals, existing repos, local previews, Git worktrees and review.
- Explain Agent, Code and Chat modes. Agent teammates have their own brief,
  memory, assigned skills, folder grants, routines and allowed handoffs.
  Agent/Chat need compatible installed Claude Code or Codex. Code Mode supports
  the broader CLI catalogue. Routines run while the desktop app is open.
- The working branch can be older than production. In September 2026, the
  checkout was `release/0.2.8` while public downloads served `v0.4.3`. Use
  `git show <published-tag>:<file>` to review newer functionality without
  changing the user's branch. `ModeSwitch.tsx`, `WorkspaceApp.tsx`,
  `components/agentMode/` and `agent_runtime/capabilities.rs` are the first stops.
- Phone chat, generated previews and Explore are a visible companion story.
  Public phone access remains unverified. The Expo bridge client alone is not
  evidence that current Tauri supports pairing or remote PC control; the 0.4.3
  source has no matching phone bridge. Do not revive the old connected-phone
  release claim without proving the new server and a real device flow.
- `/web-api/releases` owns desktop availability. Windows/Linux have public
  artifacts; macOS is conditional. Do not hardcode versions or store links.
  Homepage CTAs use same-origin `/downloads`, including local previews.
  The standalone redesign and local metadata proxy are documented in
  [[Downloads Website]]. Release integrity gates remain authoritative.
- `Plans.jsx` consumes `/api/billing/plans`, fails visibly, and supports retry.
  There is no hardcoded price fallback. Show annual total and monthly equivalent;
  distinguish cloud credits from third-party CLI subscriptions.
- Device visuals are labelled illustrative demos. Do not present them as live
  agent runs, measured results, or genuine product screenshots. No fake social
  proof or unconnected waitlist forms.

## Local delivery and validation

Run `npm run website` from the active `/home/ellis/Desktop/Vibyra` root;
the site is at `http://127.0.0.1:8128` and Laravel uses upstream port 8129.
Build assets using `npm run build` in `backend/`. The former `Desktop/SaaS`
checkout and its vault are retired. Confirm the returned page and asset MIME
types before handing out a local URL; another app may own port 8000.

`scripts/marketing/verify.mjs` exercises desktop/phone/mode tabs, keyboard
navigation, viewport controls, audience switch, annual billing, FAQ, mobile
navigation, actual destinations, and plans outage/retry. It also captures
320/390/600/768/1024/1440/1920 layouts and checks WCAG A/AA with axe. The
`verify-tour.mjs` helper adds expanded-tour states, focus/scroll restoration,
keyboard review scrolling and short landscape layouts. It uses external
QA-only `playwright` and `@axe-core/playwright` packages through `NODE_PATH`,
and the installed `/usr/bin/google-chrome`; app dependencies are unchanged.
Optional `VIBYRA_MARKETING_URL` and `VIBYRA_MARKETING_QA_DIR` select the target
and artifact directory. Existing legacy media regressions remain in
`marketing.source.test.mjs`; the obsolete homepage composition assertion was
removed when the homepage was deliberately replaced.

Native-dialog close checks must wait for `.tour-dialog` DOM removal, not a
`getByRole('dialog')` locator: closing removes the dialog from the accessibility
tree before its React close handler and cleanup run.

Manrope is self-hosted under `backend/public/fonts/` with its OFL license.
The homepage serves compressed WOFF2 faces and preloads regular/bold. Original
TTFs remain source assets. Marketing imports Tailwind preflight only; its current
components use their own CSS, so do not reintroduce the unused legacy utility
scan. Stylesheet changes still need the backend build before browser checks.
The social PNG is a browser capture of `backend/resources/media/marketing-social.html`.
The product review, claim register, scope and design plan are in
`docs/marketing-website-plan.md`. The local `plan` skill includes the release-tag
and phone-availability checks plus responsive-tour validation for future work.
