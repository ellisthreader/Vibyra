# Vibyra Bench — plan

Goal: the Benchmarks page shows **our own** measurements, run by Vibyra, instead
of quoting Artificial Analysis. Every number on the page must be reproducible
from `bench/` with one command and a spending cap.

Research behind this plan (every claim sourced): [docs/research.md](docs/research.md).

## 0. Current state (2026-09-23)

The page shows the **consensus** mode: 20 public leaderboards from 9
organisations, fitted onto one scale (per-source line a + b·skill, solved by
alternating least squares), averaged by category so the many coding boards
cannot outvote the rest; 3+ leaderboards needed for a score; 50 = average of
these models. Own runs (below) were estimated at ~$555 and deferred by Ellis.

## 1. How the leading sites benchmark (summary)

| Operator | What they measure | How | What we take |
|---|---|---|---|
| Artificial Analysis | 10-eval "Intelligence Index", speed, price | Zero-shot, neutral system prompt, `Answer: X` final line, lab-default temperature, 1–5 repeats, retries API errors (not model errors), speed = tokens after the first token, P50 over 72h from one region | Prompt discipline, API-vs-model error split, speed method, publishing the cost to run |
| LMArena | Human preference | Blind pairwise votes, Bradley–Terry, style control, rank *spread* from CIs | Show ties as rank ranges ("2–4") |
| Epoch AI | Many public evals | Inspect AI harness, 8–16 repeats on small sets, ±1 SE | Repeats on small sets, full logs |
| LiveBench | Contamination-resistant Q&A | New questions monthly, objective answers, no LLM judges | Rotation, objective grading |
| SWE-bench / Terminal-Bench | Real coding/agent work | Docker per task, apply patch or run agent, hidden tests | Hidden tests in a sandbox; agent track (phase 2) |
| Scale SEAL | Private held-out sets | Never published; labs can't pre-test | Private Vibyra questions, first-encounter rule |
| OpenRouter | Usage, latency, throughput | Live traffic P50–P99 | Model access + live prices |

What goes wrong elsewhere (and our rule against it): the same model listed at
five effort levels (we show one: highest effort); saturated tests shown as
current (we retire them); vendor numbers mixed with independent ones (we only
show our runs); no uncertainty (we show 95% ranges and tie ranks).

## 2. What exists now (phase 0 — built and tested)

```
bench/
  cli.mjs            estimate | run | report | publish
  roster.json        the 19 models, OpenRouter routes, highest effort
  lib/openrouter.mjs streaming call: TTFT, tokens/s, billed cost
  lib/runner.mjs     concurrency, API-error retries, hard --max-usd cap
  lib/store.mjs      one JSON line per attempt; re-runs resume, never pay twice
  lib/sandbox.mjs    model code runs with no network, writes only to a temp dir, timeout
  lib/stats.mjs      bootstrap 95% ranges (per suite, and jointly for the index)
  lib/aggregate.mjs  scores, Vibyra Index, rank ranges, >2% API errors = not published
  lib/publish.mjs    writes backend/.../benchmarks/vibyra-results.json (+ canary)
  suites/            code (private), instruct (private), math (AIME 2026), knowledge (MMLU-Pro)
  private/           git-ignored held-out tasks + build.mjs that proves each task sound
  test/              offline tests with a mock model (no cost)
```

- **Vibyra Index** = plain average of the four suites (0–100), with a joint 95% range.
- **Speed** = median output tokens/s across every scored call; **TTFT** = time to
  first answer token (thinking included). **Price** = OpenRouter list price;
  **run cost** = what the run actually billed.
- The website switches from the Artificial Analysis snapshot to Vibyra Bench
  **automatically** the moment `publish` writes models into
  `vibyra-results.json`. The hero, labels, method text and sources all follow.

## 3. Phase 1 — first published run (needs your go-ahead)

1. **Fix the two weak suites before publishing** (research §2):
   - *Maths*: AIME 2026 from MathArena is CC-BY-NC-SA (non-commercial) and only
     30 questions (±9 points of noise). Replace with a private Vibyra maths set
     (answers verified by code) or license-check it. Keep AIME only internally.
   - *Knowledge*: MMLU-Pro is saturated (~90%). Replace with the text-only HLE
     subset (MIT, gated: needs a Hugging Face token and accepting its terms),
     graded by exact match plus a cross-lab judge for free-form answers.
2. **Grow the private sets** so the ranges shrink: code 12 → 100+ tasks (half
   bug fixes in multi-file projects), instructions 10 → 60+. Each new task goes
   through `private/build.mjs` (reference passes, broken version fails).
3. **Back up `bench/private/`** somewhere private (it is git-ignored on purpose,
   because this repo is public).
4. `node bench/cli.mjs estimate` → approve the number → `run --max-usd <cap>`.
   Today's estimate for 19 models: **about $555** (±50%). Try OpenRouter's
   `:batch` routes (half price) for scoring once confirmed to work, and measure
   speed separately on the normal routes.
5. `report` → spot-check transcripts of surprising wins/losses → `publish` →
   `npm run build` in `backend/`.

## 4. Phase 2 — Vibyra Agent track (the thing only we can do)

Rank **agents as people use them in Vibyra**: Claude Code, Codex, Gemini CLI,
OpenCode… each with its model, on real repository tasks.

- Harness: **Harbor** (official Terminal-Bench harness, Apache-2.0) runs the real
  CLIs in Docker; results written into the same `vibyra-results.json` schema.
- Tasks: a Terminal-Bench 2.0 subset (Apache-2.0) + 50–100 private Vibyra repo
  tasks (feature, bug, refactor), scored by hidden tests in the container.
- Needs a Linux runner with Docker (this Mac has none). Cost per agent task is
  high (0.5–3M tokens); start with 40 tasks × 6 agents.

## 5. Phase 3 — keep it live

- Monthly scheduled run (GitHub Actions on a runner with the OpenRouter key as a
  secret), new models picked up from OpenRouter's catalogue into `roster.json`.
- Speed probes 8× a day on the normal routes; publish the 72-hour median, from
  one declared region.
- Rotate 20% of private questions each quarter; compare public vs private scores
  per model as a contamination signal; never let a lab pre-test on the private set.
- A methodology page on the site (method, suite versions, run date, run cost,
  a few sample transcripts), plus the canary string in every published file.

## 6. Decisions for Ellis

- Approve phase 1 spend (estimate first; the cap is enforced by the runner).
- Maths source: private set (recommended) or licensed AIME.
- Knowledge source: HLE via a Hugging Face token (recommended) or keep MMLU-Pro as a minor column.
- Where the private tasks are backed up.
