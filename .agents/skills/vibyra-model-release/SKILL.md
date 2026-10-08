---
name: vibyra-model-release
description: Research and add newly released major AI models to Vibyra Desktop and the website benchmarks, including Codex, Claude, Grok, and Gemini; update launch routing, New badges, artwork, the Mac launch modal, independent benchmark evidence, tests, and authorized live releases. Use for a model-release rollout or review, not general model recommendations.
---

# Vibyra model releases

Use this workflow when a user asks Vibyra to support a newly released major
model or to review a recent model rollout. A skill run is task-triggered; it
does not monitor releases in the background.

## Discord release alert changes

For automatic rollout architecture reviews, inventory the existing five-minute
watcher, live desktop catalog filters, native account discovery/allowlists,
phone cloud shortlist, backend curation and bundled artwork separately. Start
with `Desktop/Model Releases And Bug Reports.md`. OpenRouter listing must never
establish membership entitlement; verify the selected account/runner route.
Distinguish proposed remote catalog/artwork delivery from deployed automation.
The staged acceptance contract is `docs/automatic-model-rollout-plan.md`;
current source, credential and delivery evidence is in
`docs/automatic-model-catalog-operations.md`. The implementation is present,
but public enablement requires the live and time-based gates in that runbook.

For automatic rollout work, start with backend `Services/ModelCatalog`, the
shared signed contract and the selected-account desktop merge. Public discovery
never authorizes a native account route, Auto promotion, a launch campaign or a
funding-source switch. Known family/capability policy may admit future IDs;
unknown protocols and reasoning semantics still require review. The scheduled
server artwork adapter is separate from this skill's interactive artwork work.
Immutable PNGs are stored in the database and clients verify their content hash.
Keep bundled artwork and provider fallback. Refreshes never mutate active sessions.

Paid jobs require separate provider-enforced daily caps ($5 checks, $2 artwork),
including BYOK charges; `AutomationKeys` must reject a key missing that setting.
Store only server secrets. Use Railway CLI `--skip-deploys` for configuration,
then upload the verified isolated candidate: the dashboard's variable deployment
can rebuild stale connected Git source. Recheck the live deployment before upload
and preserve concurrent production changes. Verify natural scheduler runs,
health, runtime hashes and worker startup, not just upload success. A healthy
shadow discovery does not prove paid probes, generated art or public rollout.
Probe receipts must match the requested ID or the feed's exact same-provider
canonical ID; never infer an alias from a similar model name. Retain generation
IDs in route proof and reject identity changes within a stream. This does not
prove cancellation or customer membership entitlement.

For notification-format work, start with `Desktop/Model Releases And Bug Reports.md`
and `backend/app/Services/OpenRouterModelReleases.php`; no launcher/catalog rollout
is needed. `ModelReleaseCard` owns classification/specs/editorial importance and
`ModelReleaseBenchmarks` owns sourced ranking. Fetch only benchmark-scored models
with OpenRouter's `min_intelligence_index=0` / `min_coding_index=0` filters and
matching sort; deduplicate free/batch variants before taking the top 100. Never
turn popularity, price, missing scores or a provider's reputation into a benchmark
rank. Distinguish unknown, outside-top-100 and source failure; media categories
remain explicitly unranked until a comparable source is connected. Importance is
an editorial estimate with a reason; a strong benchmark can elevate a small lab.
Keep the Discord card compact: short summary, type/ranking/importance inline,
optional context/weights/pricing, and a title link to full specs. Detailed benchmark
metadata stays internal; omit unknown specs, I/O, output limits and API controls.
Preserve silent baseline, unchanged native feed and claim-before-send behavior.
Run `OpenRouterModelReleasesTest|ModelReleaseCardTest`; mocked tests do not establish
live delivery. A code-update request does not itself request a synthetic Discord post.

## Establish what can actually launch

1. Follow the repo memory read order, then read
   `Vibyra/_ai/Desktop/AI Terminals.md`. Inspect the current working tree and
   preserve unrelated edits and active terminal sessions.
2. Research the release **at the time of the task** from the provider's
   official model page, release notes, and visual material. Confirm the public
   release date, exact model ID and aliases, model purpose, context length,
   reasoning or effort values, default effort, rollout and plan restrictions,
   deprecation status, and any minimum CLI version. Use the provider's own
   artwork as a visual reference, not as a substitute for original Vibyra art.
   Starting points: [Codex models](https://learn.chatgpt.com/docs/models) and
   [changelog](https://learn.chatgpt.com/docs/changelog),
   [Claude models](https://platform.claude.com/docs/en/models/overview),
   [xAI models](https://docs.x.ai/developers/models),
   [Gemini models](https://ai.google.dev/gemini-api/docs/models) and
   [Gemini CLI model selection](https://geminicli.com/docs/cli/model/).
3. Separate **provider availability**, **native CLI support**, and
   **OpenRouter availability**. Verify an ID against the actual runner before
   adding it to `nativeAccountModels.ts`: Codex, Claude, and Gemini can use
   their personal-account CLIs; Grok currently routes through an enabled
   OpenRouter-capable Aider or OpenCode integration in Vibyra. Check a Grok
   slug in [OpenRouter's model catalog](https://openrouter.ai/docs/api/api-reference/models/get-models)
   before claiming it is launchable. Do not give invite-only, API-only, preview,
   or unsupported variants an unverified native route. A CLI's installed
   version and a user's account rollout may still limit access.

   Account discovery is an additional authority: `useAccountCatalog.ts` and
   `accountCatalogMerge.ts` attach the selected account's exact model/alias,
   efforts and default in `accountRoute`. Preserve them ahead of curated
   fallbacks; test advertised and empty accounts separately. Shared-chat launch
   revalidates the account catalogue; public listing alone proves no entitlement.

## Update the desktop catalog and artwork

4. Start with `desktop-tauri/src/lib/nativeAccountModels.ts`,
   `modelRunners.ts`, `staticModels.ts`, `mergeNativeCatalog.ts`,
   `modelEffort.ts`, `modelArtworkData.ts`, and `openRouterCatalog.ts`.
   Update only the layers the verified route needs. Keep native models present
   across live, cached, and offline catalogs; preserve live metadata. For a
   model available only through OpenRouter, confirm its live/catalog fallback
   behavior instead of putting it in the native allowlist. Check company
   ranking, model limits, and filters when a new model does not appear.
5. Use the verified release date for Vibyra's shared 45-day `New` window.
   Show the badge in launcher tiles, More models, and the full catalog. Check
   exact runner arguments, effort choices and default, context length, model
   ordering, deduplication, and disabled/missing runner states. When the native
   CLI and OpenRouter publish different default efforts, the curated native
   default must win in `mergeNativeCatalog.ts` for live and cached entries;
   exercise that merge with live-shaped metadata, not only the offline roster.
6. For a major model, inspect nearby `src/assets/model-icons/` PNGs and
   current official visual motifs. Use the built-in image-generation tool for
   original bitmap icons unless the user requests another method. Prompt for
   the existing card style, a distinct motif for each model, legible short
   lettering, and a square composition; inspect results at 128px and at the
   picker’s 22–34px display sizes. Save final 128×128 PNGs under
   `desktop-tauri/src/assets/model-icons/` and add precise mappings in
   `modelArtworkData.ts` (specific variants before family matches). Do not
   claim an exact image model was used when the built-in tool has no selector.

   Do not omit Haiku effort because older Haiku models had none. Haiku 5.5
   supports low/medium/high/xhigh/max and Claude Code's Ultracode, with medium
   as the native default on 2.1.293+. Confirm each later generation separately.

## Keep the iPhone current

For phone parity, read `App/Starting Project Work.md` and `App/Models And Effort.md`.
The connected phone reads `session.models` when `terminalModelsV1` is advertised.
`phoneTerminalModels.ts` derives Codex/Claude choices from the Mac catalogue and
`planRunner`; never add a second native phone model allowlist. Revalidate the ID
and provider at launch, forward the native model/default effort, and include the
catalogue ID in the phone's persisted create receipt. Serve the already loaded
catalogue immediately; background refresh must not block the 15-second window
reply. Old computers retain their default-model launch.

Vibyra-token terminals and cloud chats read effort levels from OpenRouter's
`reasoning.supported_efforts`. When a new model publishes `reasoning` without that
key, review its real control (on/off, budget or ladder) from the provider docs and
add it to `backend/config/openrouter_reasoning.php`: on/off models are
`['none', 'high']` with `toggle`, and are sent `reasoning.enabled`. Fixed thinkers
stay out. Only list models whose OpenRouter endpoints accept `reasoning` within
the listed price, since requests set `require_parameters`. Run
`OpenRouterReasoningTest`, plus `mobile/scripts/verify-token-efforts.mjs` when a new
ladder shape appears. The change ships with a backend deploy, not an app build.
The Vibyra-token terminal menu is curated (owner, 2026-10-06): only models in
`config('vibes.terminal_models')` with two or more effort levels besides off are
offered for new terminals and Auto. Each lab keeps its current main and coding
models; there are no o-series, mini or nano tiers, gpt-oss, image models or
older generations. When a new main model ships, send it one real terminal
message, then add it to that list (and drop the one it replaces) in a backend
deploy.

Cloud phone chats use a separate route: verify the live `/api/vibes/models` and
OpenRouter responses, then update `mobile/src/ui/pickerModels.ts`, the offline
catalogue/snapshot and backend curation where necessary. Preserve live funding
rules and distinguish OpenRouter default effort from native CLI default effort.
For a cloud model shortlist change, compare the exact picker IDs with
`backend/config/vibes_auto.php` and explicit entries in
`backend/app/Services/Vibes/Auto/Profiles.php`; test Auto with a live-shaped
pricing snapshot, because adding a reviewed profile can change which paid or
trial model wins. Check `backend/config/vibes.php` and the offline phone trial
flag against the backend's price-based trial ceiling. Review
`backend/config/billing.php` separately for legacy chat aliases and fallback
pricing. Carry these coordinated model changes in a reviewed model release,
not incidentally in an unrelated backend rollout.
A Mac catalogue update reaches connected phone terminals after installing the
bridge; it does not update an installed iOS binary or change cloud billing.
Run phoneTerminalModels/phoneTerminalRequests, mobile terminalModels, Rust
phone::manage, and verify-new-session in Chromium and WebKit. Verify the current
sidebar handoff with verify-project-launcher; verify-terminal-launch covers the
older standalone sheet fixture.

## Prepare the Mac launch notice for a major rollout

7. Read `Vibyra/_ai/Desktop/Major Model Launch Notice.md`. A provider-feed alert
   is not a launch campaign: update the modal only for a verified, user-facing
   major model or family that Vibyra can actually launch. Keep the current
   campaign until the next rollout is reviewed; the skill itself does not run
   in the background or publish a modal from raw feed events.
8. Replace the current release-specific content in
   `components/home/NewModelsNotice.tsx` and its full-bleed artwork in
   `assets/new-models-space.png`. Retain the dark space composition, native
   text/actions, accessible dialog, and colour gradients matched to the new art.
   Use supplied artwork when provided; otherwise generate original bitmap art
   and review it at the actual modal size. Do not bake UI text into the image.
   Recompose the scene for the actual number of featured models and providers;
   do not carry old planets, logos, traits, claims, or names into a different
   release. Check superlatives and capability claims against the provider's
   official material. Keep the CTA pointed at a working route where the new
   model can be selected.
9. Advance `MODEL_NOTICE_CAMPAIGN` in `lib/newModelsNotice.ts` with a unique
   release ID and the latest included public release date (`YYYY-MM-DD`); the 45-day window is
   derived from that date. Dismissal is per campaign: a user's “Don't show this again” choice
   suppresses this artwork but must not hide the next major release. Preserve
   existing stored choices. The Mac notice appears after FirstWelcome; What's
   New must not overlap it. Verify a new campaign can open for a user who hid
   the previous one, and that expired campaigns do not appear on fresh installs.

## Include the website benchmarks in every model rollout

The public `/benchmarks` page is a required release surface. A desktop catalogue
change alone does not complete a model rollout. Read
`Vibyra/_ai/Backend/Website Benchmarks.md`, then the website worktree's
[`vibyra-bench` skill](/Users/ellis/Desktop/Vibyra-web/.agents/skills/vibyra-bench/SKILL.md)
and its collection/curation references. That skill owns the scoring method.

- Add the verified exact version to `Vibyra-web/bench/roster.json`; preserve
  earlier models and unrelated website edits. Collect independent published
  results using the benchmark skill's three collectors plus Artificial Analysis.
  Keep exact effort, checkpoint, harness and fallback details. Never copy an
  older model's scores, use vendor launch scores as independent evidence, or
  invoke paid benchmark runs without explicit authorization.
- Rebuild consensus with live OpenRouter prices and refresh the AA fallback
  snapshot. Sparse coverage is valid: show the model in All scores and selectors
  with missing values or Early data, rather than inventing a score or rank.
  Check every supported published effort, source rows and all four views.
- Run the benchmark tests, frontend build and browser checks at desktop and
  narrow widths. Confirm the generated bundle includes the exact new model.
- For an authorized release, publish the benchmark update and verify the public
  page and its fetched bundle contain the model. Use the current Railway
  production source, merge only reviewed benchmark changes, preserve current
  routes and assets, and compare runtime hashes. Neither dirty checkout is a
  safe whole-backend deployment. The active custom domain is `vibyra.net`;
  verify configured domains at release time. Local success is not live success.
  Existing user authorization to make the release live suffices; request only
  permissions actually required by the environment.
- Report the live benchmark URL, evidence/effort coverage, score/rank or unranked
  status, and any remaining deployment limit. Write the durable route and
  validation facts to the benchmark memory note. Never say the release is live
  until the production browser check passes.

## Verify and deliver

10. Add or update meaningful catalog/runner tests for exact IDs, route gates,
   live and old-cache merging, offline presence, `New` timing, effort, and
   artwork file existence. Run focused tests, typecheck, and build; inspect
   the actual picker in both themes when presentation changes. For a launch
   campaign, run `desktop-tauri/tests/newModelsNotice.test.mjs` and
   `mobile/scripts/verify-new-models-notice.mjs` in Chromium and WebKit; review
   the rendered image, compact bounds, copy, expiry, checkbox, and CTA. A
   mock-browser pass does not establish native acceptance.

   Artwork checks must use bundled PNGs; fixtures that return null from
   `modelArtworkUrl` prove layout only. `scripts/verify-haiku-release.mjs`
   uses Vite's production glob for tile/More/full-catalog artwork and effort in
   both themes; repeat with `--webkit`. Native/catalog/badge regressions live in
   `tests/haikuRelease.test.mjs`; `modelCatalog.test.mjs` now covers signed
   remote catalogues and account discovery.
11. If the task calls for updating the Mac application, follow
   `Vibyra/_ai/Desktop/Mac Setup.md` to build, sign, install, verify the
   installed bundle, and check the reopened app. Preserve active terminals;
   distinguish an installed bundle from the older process still running.
   Publishing a public release or changing an external release feed is a
   separate action.
   Check the installed version first. If this checkout is older, port only the
   reviewed model changes onto the verified installed source before packaging;
   do not replace a newer app with the dirty main tree.
12. Report the verified model IDs and source links, artwork paths and a short
   prompt/tool-mode summary, tests, installed/running status, and any access
   or visual-acceptance limit. Write durable routing or workflow changes to
   the smallest Obsidian note. Update this skill when a real provider path or
   validation rule changes.
