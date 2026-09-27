# Owner analytics next-update release train

Status: preparation on 27 September 2026. This document ties the next website,
backend, Desktop, and iOS packages to one consented analytics contract. It is not
a production deployment approval. The production gates in
`docs/security/production-release-gates.md` still apply.

## Release order

1. Freeze reviewed source commits and package hashes for the backend/website,
   Desktop, and iOS. Confirm each native package was built from its recorded
   commit and targets the production HTTPS API.
2. Resolve the Railway service's stale linked Git source before another
   production variable change. Take and rehearse a database backup and rollback.
   Deploy the exact reviewed backend and website source, run migrations, and
   verify its source hashes, analytics and owner routes, queue worker, scheduler,
   health, and effective consent configuration. `/up` alone is insufficient.
3. Exercise unknown, decline, aggregate, linked, new-session, withdrawal, and
   delayed/offline replay against the release backend. Optional events must be
   rejected without current server consent. Check that the website choice is
   browser-session scoped and that a fresh native bearer session asks again.
4. Release signed Desktop and iOS builds only after the backend accepts their
   exact event names and properties. Check the installed/available build and a
   consenting account's real event delivery on each platform. A source test or
   locally signed package is not evidence that users received the update.
5. Verify the owner report uses only received production events and labels
   unrecorded history as unavailable. The local `8128` aggregate snapshot must
   refresh after deployment; named records remain behind owner allowlist and a
   fresh Vibyra TOTP step-up. Never add demonstration rows to production totals.

## Package acceptance

| Package | Must contain | Evidence before release |
| --- | --- | --- |
| Backend + latest website | Consent ledger and rejection gate; event schema and migrations; pruning/rollups; owner auth/report; current marketing pages, privacy choice, and snapshot exporter dependencies | Exact source inventory, PHP tests, website build/browser consent check, production source-parity check |
| Desktop | Privacy choice/withdrawal, bounded engaged intervals, named project/terminal/prompt events, current signed-in session gate | Full Desktop/Host checks, signed package hash, installed-app acceptance, updater feed for every advertised platform |
| iOS | Privacy choice/withdrawal, bounded foreground intervals, named screen/project/prompt/pairing events, production HTTPS target | Mobile checks and export, signed IPA hash, physical-device consent/replay acceptance, App Store privacy answers and distribution record |

The shared event payload contains short allowlisted identifiers, not prompt
text, transcripts, terminal content, arbitrary URLs, paths, or GPS. Approximate
country stays unknown until the server's country database is configured. Account
and Vibes server records are separate from optional product-usage events.

## Current constraints

The deployed backend still has no `/api/analytics` routes. The latest local
website and native candidates therefore cannot establish live collection.
Existing usage can be shown only from the server records that were already
kept; unrecorded website, Desktop, and iOS activity cannot be backfilled.
Production release also requires independent review and the manual security,
backup, monitoring, and device evidence listed in the repository release gate.
