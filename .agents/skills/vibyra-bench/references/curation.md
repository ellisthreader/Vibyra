# Curation rules

Apply before saving a collector's output into `bench/consensus/sources/`.
Record every drop in the file's `excluded` map (`"source-id": "reason"`).

Drop a board when it is:

1. **Double counted** — a composite plus its own parts. Keep one side:
   - AA Intelligence Index is a source → drop AA's separate Terminal-Bench,
     SciCode, GDPval, HLE, LCR runs.
   - Vals Index → drop it; keep Vals' Terminal-Bench, Vibe Code Bench, ProofBench.
   - The same board collected twice (e.g. "arena-code" vs "lmarena-webdev") → keep one.
   - Epoch re-publishing another org's numbers (Scale HLE, Vals ProofBench) → skip the copy.
   - ECI and LiveBench Global overlap their retained parts → reference-only.
   - Current cleaned HLE Diamond replaces legacy HLE; tool-enabled Diamond is
     a separate raw reference, not a second independent exam.
2. **Saturated** — nearly every roster model scores alike (GPQA Diamond,
   MMLU-Pro, AIME 2025, HumanEval+, IFEval).
3. **Floor-bound** — most models near zero. Re-check current versions: September
   FrontierMath Tier4 v2 spans a useful range and is no longer floor-bound. It
   shares the frontiermath family with Tiers1–3, rather than earning extra votes.
4. **Too narrow** — under 5 roster models (the builder ignores these anyway),
   or a niche professional domain (PRBench Finance/Legal).
5. **Stale** — no update in 2026 or older than ~45 days while newer boards exist
   (the builder warns at 45 days).
6. **Unreliable/contaminated** — e.g. SWE-bench Verified has documented
   contamination and faulty-test concerns; evaluator withdrawal does not mean
   the benchmark maintainers retired it. Record the precise exclusion reason.

Keep in mind: the official Terminal-Bench board and Vals' Terminal-Bench run are
different setups and both count; a lab's self-reported number never counts.

Effort runs are measurements of one board, not extra independent boards. Keep
all valid runs and let `efforts.mjs` select each exact-effort profile. Never
merge xhigh/max or borrow unspecified effort to fill a missing max result.
Version/date mismatches must be omitted, even when this reduces model coverage.

Official submission boards may mix vendor/agent-team runs; don't call them
independent evaluator replications. Keep mixed Terminal-Bench as raw reference.
AA IFBench was removed from Intelligence Index in v4.1 and remains standalone
in v4.3.2. It is an instruction-following diagnostic with sparse frontier coverage;
AA-Briefcase remains in the index. Use current component lists, not old articles.
