# App - Integrations

Read this before changing the Integrations destination, an integration's page, the
connectors behind it, or the brand marks any of them draw. The backend contract
lives in `backend/config/chat_connectors.php` and is mirrored, deliberately
duplicated, in `mobile/src/integrations/catalogue.ts` so the page draws before a
server answers. Keep the two in step, in the same order.

In code this feature is **chat connectors**. `release/0.6.3-macos` has a
separate Integrations feature - OAuth connections for the desktop agents
(Google, Microsoft, Stripe, Shopify, GitHub) under `/api/integrations`,
`IntegrationsController`, `config/integrations.php` and `App\Services\Integrations`.
The phone chat went onto production's backend line, `release/macos-web`, on
2026-09-11 (branch `launch/vibes-on-macos-web`), and ours was renamed rather
than theirs so the two can meet in a later merge without colliding: `/api/connectors`, `ChatConnectorsController`,
`config/chat_connectors.php`, `App\Services\ChatConnectors` (`ConnectorTools`,
`ConnectorRunner`), `CHAT_CONNECTORS_ENABLED`, and `connectors:smoke`. The phone
keeps the word "Integrations" on screen and in `mobile/src/integrations`, and the
Vibes quote field is still `integrations`. The two could share one account
broker one day (a GitHub connected once for both); today they are independent.

This was called Plugins until 2026-09-10. Nothing shipped under that name: the
rename went through the table (`vibes_integration_installs`), the column
(`vibes_tools.integration`), the quote field (`integrations`) and the env var in
one go, so there is no compatibility shim to keep. The word "plugin" left in this repo
belongs to Tauri, Vite, Composer or OpenRouter's own `web_plugin`, and none of it
is this feature.

## What is in the catalogue

Two, in the order `Registry::CONNECTORS` gives and the page draws:

| Slug | Service | For |
| --- | --- | --- |
| `github` | GitHub | code |
| `stripe` | Stripe | money |

Gmail, Google Calendar, Notion, Todoist, Linear, Sentry and Vercel were built and
then removed on 2026-09-11, with the Google OAuth flow (`GoogleOAuth`, the
`/google/callback`, `/start` and `/flows` routes, `useOauthConnect`, and the
`configured` / "Needs setup" state that only an OAuth integration could be in).
The reasons, so they are not re-added blind:

- Gmail's scopes are restricted: beyond 100 test users it needs Google's review
  plus a yearly paid CASA assessment, and in Testing mode every connection
  expires after 7 days. Calendar's scope is sensitive and needs a review too.
- Todoist's `rest/v2` and `sync/v9` APIs answer `410 Gone`; the connector would
  have needed moving to `api/v1`.
- The in-app key instructions for Sentry (organization tokens cannot be scoped,
  and connecting needs `org:read`) and Vercel (no read-only tokens exist, and
  new ones start `vcp_`) sent people to a token that would not work.

The removed code is in `tmp/integrations-backup-2026-09-11.tar.gz` (gitignored)
if any of it is wanted back.

A slug has to be lowercase alphanumeric: it is the route segment
(`{integration}` is constrained to `[a-z][a-z0-9]*`), it is the `@mention` a
person types, and it is the prefix every one of that connector's operations
carries so `Registry::ownerOf` can route a tool call home without a lookup table.
**No slug may be a prefix of another** or one connector would answer the other's
calls; `test_every_listed_integration_owns_the_tools_it_offers` is what catches it.

## Reads and writes

`reads` and `writes` on a catalogue entry are the two sentences the page prints
under `Reads` and `Changes`. `writes` is null for anything that only looks, and
the section is then absent - its absence is the signal, so never print a section
that says "nothing".

A connector declares its write operations in `Connector::writes()`, and
`test_anything_that_can_change_something_says_so_in_the_catalogue` asserts the
declaration and the sentence agree in both directions. This exists because the
sentence is the one claim on that page nobody can check for themselves: a
connector that grows a write and leaves `writes` null would ship a page promising
it only looks. Adding a write tool means three edits, and the test fails until
all three are done - the tool, `writes()`, and the sentence in both catalogues.

Each integration has exactly one write, and both are purely additive: GitHub
opens an issue, Stripe creates a customer record. Nothing edits, deletes, closes,
reassigns or moves anything that already exists, and Stripe moves no money at
all. A future write has to clear the same bar: it destroys nothing, and it is
easily undone.

`stripe_create_customer` hands back an existing customer for an email that
already has one, because a model retrying a call it was unsure about is the
normal case and a double customer is invisible until someone is billed twice.

## Connecting

Every integration is a pasted key. `Installs::connect` proves it against the
provider before storing it, so a mistyped key is refused at connect time rather
than mid-reply. Keys are encrypted with the application key and never read back
to a client; the page shows the account label the provider itself reported.

`Catalogue::entry` publishes exactly `label`, `placeholder`, `help` and `url`
under `credential`, and a test asserts that list.

`credential.help` is the only setup instruction a person gets, so it has to name
every permission the connector actually uses. GitHub's says Issues read even for
a token that never writes, because without it issue search silently skips every
private repository.

## Shape of the page

`mobile/src/ui/IntegrationsScreen.tsx` is one sentence, then inset grouped cards
of `mobile/src/integrations/IntegrationRow.tsx`, then one line about keys being
encrypted.

- There is no worked example above the list and no mention pill on the rows.
  Both were tried. The example was a grey band between the sentence and the only
  part of the page you can act on, close enough in shape to a search field to be
  mistaken for one; the pills were badges to decode down the right-hand edge,
  each repeating the name beside it. "Use it in a chat" on the integration's own
  page puts the mention in a chat instead.
- Connected and not-connected are two groups, not a badge per row. Section
  labels appear only when both groups are filled, so an account with nothing
  connected sees one plain list.
- A row's second line is one fact: who it is connected as, else the tagline. The
  longer description belongs on the integration's own page, never in the list.

`IntegrationPage.tsx` answers with two labelled lines, `Reads` and `Changes`,
rather than a list of abilities as well; `abilities` is still in the catalogue
but is not drawn. `Changes` is set in full text colour rather than muted, because
it must not read as small print. The key form replaces the description inside
the same sheet - never a second modal over a live one.

A refused key or failed disconnect is held in the page's own state and cleared
every time the page opens. It used to come from the shared provider `error`, so
GitHub's "That token did not work" was printed on Stripe's page too. The
provider's `error` now only matters while `live` is false, and the footer says it.

## Brand marks

Integration marks are drawn by `Mark` in `mobile/src/ui/BrandLogo.tsx` from
`mobile/src/integrations/integrationBrands.ts`, sharing the `Brand` shape with
the model vendors in `ui/brands.ts`. `Brand.tile` carries a company's own icon
background; a tiled mark gets a hairline and a larger glyph.

Paths come from the `simple-icons` package, not from memory. Recalled paths were
tried and two of them were wrong in ways that only showed up on screen, so the
rule is: take the path from the package, then render it before committing it. A
wrong path is not a missing logo, it is a shape that looks like a bug.

- Stripe is the white S on `#635BFF`, its real app icon. Drawn as a purple glyph
  on our neutral tile it read as an initial-letter placeholder.
- GitHub stays untiled and monochrome by design, following the theme, as OpenAI
  and xAI do.

An integration with no mark still renders - `integrationBrand` falls back to a
title-cased initial - so a connector added on the backend never draws a blank tile.

## Validation

`php artisan test --filter='ChatConnectorsTest|ConnectorOperationsTest'` covers the
catalogue shape, tool routing, the writes contract, every operation against a
recorded answer, what each write puts on the wire, and Stripe's double-create.
Recorded answers cannot catch a provider retiring an endpoint - that is how
Todoist's `410` went unnoticed - so `php artisan connectors:smoke` against real
keys is the check before shipping.

`npm run verify:integrations --prefix mobile` walks browse, page, refusal,
connect, hand-off, a refusal not leaking onto another page, the writes
disclosure, the unreachable server and the composer's `@` suggestions in both
themes at two sizes, into `/tmp/vibyra-integrations-screenshots`. Screenshot
copy assertions live in that script, so a copy change on this page is a script
change too. The fixture's `?state=readonly` clears `writes` across the catalogue
so the absence of that section stays covered while every real integration has one.

The two catalogues being in step is still only enforced by eye. Dumping
`config('chat_connectors.catalogue')` and diffing it against `fallbackIntegrations`
field by field is the check to run after changing either.
