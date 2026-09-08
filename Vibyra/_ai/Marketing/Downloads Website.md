# Downloads Website

The public `/downloads` and compatibility `/account/downloads` routes render
`backend/resources/views/downloads.blade.php` and `resources/js/downloads.jsx`.
The September 2026 user-requested redesign matches [[Marketing Website]]:
self-hosted Manrope, pearl surfaces, cobalt actions, shared navigation/footer,
native platform marks and responsive installation cards. The hero is a centered
“Download Vibyra.” heading, one short description and an understated release
line. The user requested this simpler direction: omit the previous illustrated
app tile, technical coordinate labels and repeated download/account badges.
Short laptop viewports use less hero padding so installer choices appear sooner;
phone supporting text stays at 16px, with the release line at 12px.
Components live in `resources/js/marketing/downloads/`; `downloads.css` imports
three focused CSS modules. The previous portal downloads branch is unmounted.

## Authority and product copy

`WebsiteDownloadsController::catalog` serves `/web-api/download-catalog`.
Outside Laravel's `local` environment it delegates to `ReleaseDownloadController`.
Locally, where installer storage is empty, it requests only public metadata
from the fixed `https://vibyra-production.up.railway.app/web-api/releases` URL.
This avoids the public server's localhost CORS restriction. Requests have timeouts,
do not follow redirects or forward browser credentials, and fail with recoverable
503 responses. No fabricated or outdated release fallback is displayed.

The frontend accepts only the approved origin or same-origin file routes and
known platforms. Active packages require `available: true`, a version, matching
extension, positive size and a 64-hex SHA. Actual attachment routes retain the
existing server-side file-size and checksum gates. Ignore metadata-provided URLs.
Do not hardcode a version: public Windows and Linux were 0.4.3 during review,
but the working branch was older. Mac architectures remain independently gated.
Browser detection recommends an OS only; never infer the Mac's architecture or
recommend a desktop installer to an iPhone, iPad or Android visitor.

No account or payment is needed to download. The desktop app requires Vibyra
sign-in before its workspace. Agent/Chat use compatible installed Claude Code
or Codex; Code Mode exposes the broader CLI catalogue. Provider accounts and
usage are separate. Phone access and current desktop pairing are forthcoming.
Update guidance uses the app's command bar and download/restart prompts.

## Interactions and styles

`DownloadsPage` owns the installation-platform selection. A card's Getting set up
link selects its matching guide before navigating to `#setup`. Installation tabs
support arrow/Home/End keys; Linux offers .deb and AppImage when each is available.
Commands use actual release filenames with a conservative shell-safe character
allowlist. Clipboard success and denied access have announced feedback.

`HomeNav` and `HomeFooter` accept `homePath` so homepage section links still work
from downloads. Homepage CTAs always navigate to same-origin `/downloads`;
downloads-page CTAs jump to `#installers`.

Scope new CSS with `.downloads-page`: Vite can load shared marketing CSS after
the entry's own stylesheet, so equal-specificity heading/paragraph rules lose
to the shared reset. Use specificity rather than relying on import order.

## Validation

Build with `npm run build` in `backend/`; run `npm run website` at repo root.
Open `http://127.0.0.1:8128/downloads`.
`scripts/marketing/verify-downloads.mjs` uses the homepage's external Playwright
and axe QA dependencies via `NODE_PATH`. It captures eight 320–1920px layouts,
including a 1366 × 768 laptop viewport,
checks live metadata and attachment headers, tabs, copy success/denial, links,
alias, outage/retry, partial Mac availability and all-unavailable states.
After the initial live page check, viewport/interaction cases replay that same
live response; synthetic Mac/error fixtures are explicit. It does not download
and independently hash full installers. Server integrity behavior is covered by
`WebsiteReleaseAccessTest`; local metadata behavior by `WebsiteDownloadCatalogTest`.

Default artifacts: `/tmp/vibyra-downloads-qa/final/`. Override with
`VIBYRA_DOWNLOADS_QA_DIR`; `VIBYRA_MARKETING_URL` chooses the website origin.
Run the homepage browser verifier after changes to shared navigation.
The implementation record is `docs/downloads-website-redesign.md`.
