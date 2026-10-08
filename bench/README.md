# Vibyra Bench

Two ways to score models for `/benchmarks`:

1. **Published-source consensus (free):** `node bench/cli.mjs consensus` combines
   public leaderboards saved in `bench/consensus/sources/*.json` into exact-effort
   profiles (see `lib/consensus.mjs`, `lib/efforts.mjs`, `lib/evidence.mjs`). To refresh,
   update those snapshot files with current numbers, re-run, then `npm run build`
   in `backend/`. Each file lists what was excluded and why (double counting,
   saturated tests, checkpoint mismatches). Rebuilding source is separate from
   production deployment. The website skill owns collection and browser review.
2. **Own runs (built, unused):** we run tests ourselves through OpenRouter.
   A published own run takes priority over the consensus on the page. The plan and the reasoning behind every choice: [PLAN.md](PLAN.md).

```bash
node bench/cli.mjs estimate                        # expected cost, no calls made
node bench/cli.mjs run --max-usd 50                # all models, all suites, hard cap
node bench/cli.mjs run --max-usd 5 --models gpt-6-luna --suites code --limit 3
node bench/cli.mjs report                          # scores + 95% ranges in the terminal
node bench/cli.mjs publish                         # writes the site's vibyra-results.json
node bench/cli.mjs run --mock --limit 3            # full pipeline, offline, free
node --test bench/test/bench.test.mjs              # harness tests (mock model)
node bench/private/build.mjs                       # re-check every private task is sound
```

- The OpenRouter key comes from `OPENROUTER_API_KEY`, `--env <file>`, or `backend/.env`.
- Runs are saved per month in `bench/runs/<YYYY-MM>.jsonl`; re-running resumes and
  never pays for the same attempt twice. `--run <name>` starts a separate run.
- `bench/private/` holds the held-out questions. It is git-ignored because this
  repo is public; back it up somewhere private.
- Add a model: one line in `roster.json` (its OpenRouter id and effort).

The capability score averages benchmark families within each evaluator/category,
then gives evaluators equal weight and averages available capability categories.
It needs three evaluator groups and three categories at the exact published effort.
Unknown effort never fills max coverage. Each board is calibrated once against
the roster; effort levels share those reference lines. Same-effort harness runs
count once, preferring published fallback-as-failure scores when available.

Human preference remains separate. Composite ECI/LiveBench Global, the legacy HLE
exam, mixed agent-team submissions and narrow boards can be inspected as references
with `consensus: false` and `consensusReason`; they do not influence calibration.
The current cleaned HLE Diamond replaces legacy HLE; related FrontierMath and
game-puzzle boards share a family. Co-authored CAIS/SEAL results share SEAL's
evaluator group. More boards do not imply more independent evidence.

Coverage differs by model and missing categories are not estimated. Scores are
heuristic summaries, not benchmark accuracy or an equal-compute contest. The
leave-one-evaluator range uses the fixed scale; it is sensitivity, not a 95% CI.
Some omissions lose category coverage, which is flagged. Inspect raw sources and
common categories when a ranking is close. Current validation:

```bash
node --test bench/test/*.test.mjs backend/resources/js/marketing/benchmarks/*.test.mjs
npm run build --prefix backend
```
