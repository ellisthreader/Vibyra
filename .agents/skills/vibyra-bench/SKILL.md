---
name: vibyra-bench
description: Refresh or audit Vibyra Bench on the website's /benchmarks page. Use for new models, effort-level comparisons, additional trusted benchmarks, or questions about the Vibyra Score. Collect published independent results, preserve exact efforts and raw references, audit the method, rebuild and verify. Free: never pay to run models.
---

# Vibyra Bench

Vibyra Bench is an **available-evidence capability summary**. Sources share a
reference scale and evaluators have equal weight within each category. It is a
heuristic, not benchmark accuracy, statistical consensus or an equal-compute race.

Everything lives in the `Vibyra-web` worktree (`/Users/ellis/Desktop/Vibyra-web`):

| What | Where |
|---|---|
| Model list | `bench/roster.json` |
| Leaderboard snapshots (one file per collector) | `bench/consensus/sources/*.json` |
| Calibration / effort / evidence | `bench/lib/consensus.mjs`, `efforts.mjs`, `evidence.mjs` (+ `consensus-check.mjs`) |
| Build command | `node bench/cli.mjs consensus` |
| Page data it writes | `backend/resources/js/marketing/benchmarks/consensus-results.json` |
| Page mapping | `backend/resources/js/marketing/benchmarks/fromConsensus.js` |

Never use `bench/cli.mjs run` in this skill: that path spends money on API calls
and needs Ellis's explicit approval (last estimate ~$555).

## Workflow

1. **Add new models to the roster.** For each newly released model, add one line
   to `bench/roster.json`: `id` (kebab-case), `name`, `provider` (a key of
   `PROVIDERS` in `benchmarks/snapshot-aa.js`; add a provider + logo in
   `public/media/marketing/providers/` if it's a new lab), `openrouter` id
   (check `https://openrouter.ai/api/v1/models`), `released` (YYYY-MM),
   `openWeights`. Drop models that are clearly retired only if Ellis agrees.
2. **Collect fresh scores in parallel.** Launch the three collectors in
   `references/collect.md` as background agents in one message (general
   leaderboards, independent evaluators, coding & maths). Paste the roster ids
   and names into each prompt. They write to the session scratchpad, never into
   the repo.
3. **Curate, then save.** For each collector file, apply `references/curation.md`
   (check overlapping families, saturated tests, duplicates, sparse and stale
   coverage), then write it over the matching file in
   `bench/consensus/sources/` with an `excluded` map saying what was dropped and why.
   Useful narrow/overlapping boards may remain visible with `consensus:false`
   and a concise `consensusReason`. They must not affect calibration or the score.
   Set stable `evaluator` groups and `family` ids; co-authored CAIS/SEAL results
   share SEAL's evaluator group. Publication is not proof of an independent run.
4. **Build.** `node bench/cli.mjs consensus`. It refuses to build on errors
   (unknown ids, non-numbers, duplicate sources) and prints warnings: stale
   boards, profiles with under 3 evaluators or 3 capability categories (no score), under 6 capability boards (shown as
   "early data"). Resolve errors; judge warnings.
5. **Sanity-check the ranking** (see "Is it realistic?" below). If something looks
   wrong, trace it: `consensus-results.json` holds every effort profile's per-board
   value, rank, chosen variant and all same-effort raw measurements.
6. **Rebuild and verify the page.** `cd backend && npm run build`, confirm the
   bundle contains the new data (`rg -l "<new model name>" public/build/assets/benchmarks-*.js`),
   then load `http://127.0.0.1:8128/benchmarks` (start it with `npm run website`
   in the worktree root if it's down) with playwright-core and check: no console
   errors, every effort option across all four views, raw source rankings,
   same-model effort comparisons, fallback details, and no horizontal overflow
   at 1440/390/320px. Chrome MCP often can't reach the local site; use
   playwright-core from the scratchpad with `mobile/node_modules` symlinked in.
7. **Run the tests.** `node --test bench/test/*.test.mjs backend/resources/js/marketing/benchmarks/*.test.mjs`.
8. **Publish and verify when the task requests a live release.** Follow the release handoff below; local checks are not production acceptance.
9. **Report** to Ellis in plain words: the new model's Vibyra Score, rank, how
   many leaderboards back it and whether they agree, what moved, which boards
   were added or dropped and why, and any doubts. Keep the table short.

## Is it realistic?

- New models appear on few boards for the first weeks. Under 6 boards they're
  tagged "Early data"; say so in the report instead of over-claiming a #1.
- Agreement "mixed" means boards disagree (often coding vs preference). Report
  which boards pull it up or down rather than hiding it.
- A lab's own launch numbers are not a source. Only independent/public boards.
- If one board moves a model more than ~10 points on its own, check that board's
  variant choice and date before accepting it.
- When the user questions a ranking, audit raw values, exact checkpoints,
  category coverage, source dependence and leave-one-evaluator sensitivity.
  Never adjust weights to achieve a preferred winner. Fable's high September
  position survived every original-snapshot evaluator deletion; its later gap
  from Astra is tiny and the sensitivity ranges overlap.

## Refresh checks

- Keep serving-speed SKUs (Prime, UltraSpeed, batch) out of the model roster
  when they reuse an existing checkpoint. Never copy base scores to a new version.
- Decode Artificial Analysis's embedded Next.js/React Flight JSON, preserving
  exact `intelligenceIndex` and `indexScore * 100` values. Preserve ALL published
  same-version variants in `measurements`, including effort/mode/harness/fallback.
  Use the exact effort's chosen run's `medianOutputTokensPerSecond` for speed.
  Never inherit max speed into low effort. Exclude multi-model agents.
  Slug matching must use exact versions and explicit effort suffixes: Sonnet 5
  must never match Sonnet 5.5. Parse explicit effort annotations, not branding:
  Qwen3.8 Max and Mistral Medium 3.5 do not declare max/medium effort. Preserve
  dated checkpoints: generic Qwen3.8 Max August results are not the 0902 model.
- Keep actual board dates; if only fetch date or per-row publication dates are
  available, say so in notes. Preserve the official split and version (Scale
  SWE-Bench Pro V2 HARD is not Full; latest Vals Terminal-Bench is 4.0).
  When a board publishes fallback-as-failure scores, prefer those over attributing
  older-checkpoint fallback wins to the named new model.
- A listed model can have no consensus score. Keep it in All scores and model
  selectors, with a dash for missing values; rankings and value charts omit it.
  Do not invent scores. Existing tests must accept null intelligence for these
  models. Confirm live OpenRouter prices were actually fetched: the consensus
  builder emits a warning on catalog errors; a warning is not a fresh price pull.
- Port 8128 may belong to a temporary test checkout. Inspect the listener's cwd
  with `lsof -a -p <pid> -d cwd`; use a separate preview port when it is not the
  website worktree. Static Vite previews must load CSS from imported manifest
  entries as well as the entry's CSS; mock only unrelated session/consent APIs.
  Before full-page screenshots, blur controls, scroll with `behavior:'instant'`
  and wait for `scrollY===0`; smooth scrolling otherwise captures sticky navigation
  partway down the full-page image and offscreen fixed skip links.

## Method (don't change casually)

- Each eligible board is fitted as `value ≈ a + b·skill` across the models it covers
  (alternating least squares), so different units (Elo, %, index) and different
  coverage are handled. Average families within evaluator/category, then average
  evaluators, then available capability categories (overall, coding, agents,
  reasoning, knowledge, instruction). Missing categories are not estimated.
  Preference is displayed separately and has zero capability weight.
- Calibrate each source ONCE using its highest explicitly reported effort per
  roster model. Project every exact-effort profile through the same fitted lines;
  never recenter each effort, which would make weak low-effort results average.
- Score = 50 + 15·skill, clamped 0–100: 50 is the calibration roster reference,
  not a promise that the displayed effort profiles average 50.
- A profile needs ≥3 evaluator groups across ≥3 capability categories (and ≥3
  eligible boards); boards need ≥5 roster models
  overall, even if fewer peers publish one particular effort.
- `measurements` is authoritative. Keep `none/low/medium/high/xhigh/max/default/
  unspecified` separate. Highest reported chooses the highest observed named
  effort, not the best score; unreported effort never fills max/high coverage.
  Levels with identical labels remain provider-specific settings, not equal budgets.
- Same-effort harnesses count once per board. Prefer published fallback-as-failure
  runs over unreported fallback policy over fallback-enabled wins; then use the
  strongest same-effort harness. Keep every raw run inspectable. Coding combines
  coding and agent categories. Insufficient exact-effort coverage stays unranked.
- `evidence.mjs` computes leave-one-evaluator sensitivity using fixed fitted
  lines. It is not a 95% CI; omissions that lose category coverage are flagged.
  Show point ranks, sensitivity ranges and evaluator/category coverage together.
  Inspect full-refit convergence and slope/raw-SD ratios during method audits;
  a theoretical instability is not evidence that a current ranking is wrong.
- Known limits (documented on purpose): AA's and Epoch's indexes are
  composites; underlying test families overlap across evaluators/categories;
  category coverage differs; best-harness selection favours more tested models.
  ECI and LiveBench Global are reference-only because their parts are used.
  Official Terminal-Bench submissions are reference-only; independent Vals runs
  remain eligible. Cleaned HLE Diamond replaces legacy HLE, also reference-only.
  Do not interpret ratios of this affine score as percentages of capability.

## Page facts

- Price comes live from OpenRouter at build time; profile speed comes from its
  exact AA run. `snapshot-aa.js` is a refreshed fallback, not an effort speed proxy.
- The global effort selector controls all views and stat cards. Rankings also
  supports individual raw source boards; stat cards continue showing consensus.
  All scores can expose raw columns and a selected profile's published run details.
- If `vibyra-results.json` ever holds models (a paid own run), it takes
  priority over the consensus. Leave it empty unless Ellis approved a run.
- Keep the top of the page minimal and the Artificial Analysis credit small
  (Ellis's decisions, 2026-09-23).

- Design-only work preserves the data. `BenchmarkExplorer.jsx` presents one of
  four mounted comparison views; switch through each during validation and
  check the value map recovers its width after being hidden. The hero keeps four
  matte stat cards: category/logo, model name, then value/unit. Use two columns
  below 900px. The owner removed the full source disclosure: keep only a short scoring
  explanation and compact price/speed links below the comparison tools.
- The benchmark page follows the dark homepage theme (`marketing-home-cinematic`,
  `--home-dark`, `--site-surface`), including charts, controls and score cells.
  Check the live homepage palette before visual work; the old pearl page is
  superseded. Heatmap copy must match its brighter-is-better dark colour ramp.


## Model-release handoff and production acceptance

The main repo’s `vibyra-model-release` skill requires this website surface for
every model rollout. Add exact new versions even when they are unranked, retain
published effort runs, and explicitly report whether the public update shipped.
An existing instruction to make the model release live authorizes this scoped
website publish; ask only for permissions required by the environment.

Read the production release notes in the main Obsidian website memory. Snapshot
the latest running backend before staging; preserve its app, config, migrations,
routes, worker/scheduler scripts and public assets. The dirty main and website
backends are not deployment baselines. If production has the older benchmark
implementation, port the reviewed benchmark module and its `bench-*.css` imports
together; keep the rest of the website. Compare source hashes and the route
inventory with `APP_ENV=production` (testing enables retired desktop routes).
Check deployment identity again immediately before publishing; rebase if another
release moved it. Keep `railway-production` current with the verified source so
a later config rebuild cannot regress the backend.

Verify `https://vibyra.net/benchmarks` (confirm Railway’s configured domain each
time), the fetched manifest/bundle, actual rendered model rows, all effort/view
controls and narrow-width overflow. Also smoke-check health, downloads and current
API/catalog routes, and compare runtime source hashes. A Railway SUCCESS or `/up`
alone does not prove the website works: an October 8 CLI image had only build
files under public and passed health while `public/index.php` was missing. Always
check that entrypoint, fonts/provider artwork and active media survive packaging.

Keep original coding-agent fallback telemetry and canonical checkpoint mappings
visible. Current AA Haiku5.5 rows explicitly map private Verrine EAP hosts to the
released model; preserve that owner mapping and never infer release equivalence
from an EAP name alone. Do not fabricate fallback-adjusted scores. When refreshed
AA display labels omit an effort, preserve previously verified exact-run owner
metadata only for the same variant/value, with its original metadata date.
