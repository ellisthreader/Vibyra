# Downloads website redesign

The downloads page now follows the marketing homepage's visual system and gives
visitors a direct path from choosing an installer to opening their first project.
Both `/downloads` and `/account/downloads` serve the new standalone page.

- Pearl background, large Manrope typography and restrained cobalt accents
  connect the page to the homepage. The simplified hero centers “Download Vibyra.”
  above one sentence and a subtle free-download/beta/version line. It replaces
  the previous two-column illustration and repeated badges at the user's request.
- Windows, Linux and macOS have clear platform cards. Linux supports both .deb
  and AppImage; Apple Silicon and Intel become available independently.
- Versions, file sizes and active download actions come from release metadata.
  Browser OS recommendations never guess a Mac architecture.
- Setup links select the matching Windows/Linux/macOS instructions. Linux
  commands use the exact current filename and support copy with visible feedback.
- Existing users get updater guidance. Six FAQs explain accounts, packages,
  macOS, phone availability, updates and existing coding agents.
- Shared navigation links back to the appropriate homepage sections. Homepage
  download actions open the same-origin redesigned downloads page.

## Runtime and release behavior

`resources/js/downloads.jsx` is a separate Vite entry. React sections live in
`marketing/downloads/`; three scoped stylesheets extend the shared marketing CSS.
The legacy portal download view is no longer mounted.

`/web-api/download-catalog` delegates to the current release controller outside
the local environment. Locally, with no installer artifacts, a fixed-origin
server request reads public release metadata and returns public attachment links.
It forwards no browser credentials and has bounded timeouts. Failures show retry
instead of fabricated release information. Existing attachment availability and
file integrity gates remain in charge.

Downloading needs no account or payment. Opening the desktop app requires Vibyra
sign-in; compatible coding agents still use their own provider accounts. Public
phone access is forthcoming. This change was delivered locally, without deployment.

## Verification

The production asset build, 12 backend tests (62 assertions), and 11 focused
JavaScript tests passed. Browser checks passed at 320, 390, 600, 768, 1024, 1440
and 1920px, with no horizontal overflow, broken images or page errors. Axe A/AA
checks found no violations on desktop, mobile and expanded FAQ states.
The homepage's seven-layout browser regression also passed after the shared
navigation update, including its expanded tour and live downloads destination.

Interaction checks covered matching setup links, keyboard tabs, package switches,
actual clipboard contents and denied access, menu navigation, page anchors,
the account-downloads alias, API outage/retry, one available Mac architecture,
and no available packages. Public attachment HEAD responses were checked for
200 status, attachment disposition and checksum headers; full installer downloads
were not repeated as part of the website design review.

```bash
# From backend/
npm run build
php artisan test --filter='Website(ReleaseAccess|DownloadCatalog)Test'

# From the repository root; QA dependencies remain outside the app
NODE_PATH=/tmp/vibyra-marketing-qa/node_modules node scripts/marketing/verify-downloads.mjs
```

Run `npm run website` from the root and open `http://127.0.0.1:8128/downloads`.
QA screenshots and reports are in `/tmp/vibyra-downloads-qa/final/`.
The simplified hero's seven-width visual and interaction checks also passed;
its screenshots and accessibility reports are in `/tmp/vibyra-downloads-qa/simple-hero/`.

The subsequent polish pass reduces hero spacing on short laptop screens and
increases the release-line and phone description text sizes. At 1366 × 768,
Windows, .deb and AppImage buttons are now all visible before scrolling.
The build and eight-layout browser verification passed, including accessibility
and existing download interactions. Artifacts: `/tmp/vibyra-downloads-qa/polish/`.
