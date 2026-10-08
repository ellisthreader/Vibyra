# Collector prompts

Launch all three as background `general-purpose` agents in one message. Replace
`{ROSTER}` with `id = Name` pairs from `bench/roster.json`, `{DATE}` with today,
and `{OUT}` with a path in the session scratchpad. Each agent may read the
current snapshot in `bench/consensus/sources/` to see last run's boards and URLs.

## Shared rules (append to every prompt)

```
Use the available web search/fetch tools and curl for raw source downloads. Do not edit
repo files; only write {OUT}.
Roster (use these ids exactly): {ROSTER}
Rules: exact published numbers only, never estimate. Prefer raw data (CSV/JSON
files, APIs, Hugging Face datasets, data embedded in the page) over rendered
pages; mark anything read through a summariser "confidence":"low". If a model
has several variants (effort levels, thinking modes, snapshots, agent
harnesses), retain ALL exact-version runs under "measurements". Each run needs
value, variant, effort (none|low|medium|high|xhigh|max|default|unspecified), rawEffort,
mode (thinking|non-thinking|adaptive|unspecified), fallback (true|false|null),
harness (string|null), and optional exact-run speed. Preserve published adjusted
fallback-as-failure results alongside originals. Unknown effort is unspecified,
never inferred as max. Branding words (Qwen Max, Mistral Medium) are not effort.
Top-level value/variant may be a compatibility row; measurements are authoritative.
Omit models that are not listed (no nulls, no guesses). Don't match
a different model version (e.g. Opus 5 is not Opus 5.5). Record the exact data
URL and the board's own "last updated" date (else the fetch date, and say so).
Write JSON: {"sources":[{"id":"kebab-id","name":"...","org":"...","url":"...",
"updated":"YYYY-MM-DD","metric":"...","category":"overall|coding|agents|reasoning|knowledge|instruction|preference",
"higherIsBetter":true,"confidence":"high|medium|low","scores":{"<rosterId>":{"value":0,"variant":"...","measurements":[{"value":0,"variant":"...","effort":"max","rawEffort":"max","mode":"unspecified","fallback":null,"harness":null}]}},"notes":"..."}],
"staleOrSkipped":[{"board":"...","reason":"..."}]}
Final reply: sources collected, roster models covered by each, and doubts.
Set evaluator/family metadata. Useful narrow or correlated references may use
"consensus":false with a concise "consensusReason"; they do not earn score votes.
```

## 1. General leaderboards → `lmarena-livebench.json`

```
Today is {DATE}. Collect current scores for a consensus AI benchmark.
Sources: LMArena / arena.ai — Text (style-controlled default view, category
"preference"), WebDev/Code ("coding"), Agent arena ("agents"); prefer the
Hugging Face dataset lmarena-ai/leaderboard-dataset. LiveBench — global average
("overall"), Coding ("coding"), Agentic Coding ("agents"); compute from
livebench.ai's latest table CSV + categories JSON the way the site does
(mean of task scores per category, then mean of categories).
```

## 2. Independent evaluators → `independent.json`

```
Today is {DATE}. Collect current scores for a consensus AI benchmark.
Sources: Epoch AI — Epoch Capabilities Index ("overall", epoch.ai/data/eci_scores.csv)
and benchmark hub data (epoch.ai/data/benchmark_data.zip): FrontierMath Tiers 1–3
("reasoning"), SimpleQA Verified ("knowledge"), APEX-Agents ("agents").
Scale SEAL (labs.scale.com/leaderboard): SWE-Bench Pro ("coding"), MCP Atlas
("agents"), current HLE Diamond (prefer lastexam.ai/blog/hle-diamond over stale
SEAL copies), and others that cover ≥5 roster models. Also check official ARC
Prize verified ARC2, Epoch Chess/Mystery/Furniture, and current FrontierMath
Tier4 v2. Keep versions/splits/tool conditions separate. Vals.ai: Terminal-Bench
("agents"), Vibe Code Bench ("coding"), ProofBench ("reasoning") — not the Vals
Index itself. CAIS official Humanity's Last Exam ("knowledge").
```

## 3. Coding & maths → `coding-maths.json`

```
Today is {DATE}. Collect current scores for a consensus AI benchmark.
Sources: the official Terminal-Bench leaderboard (tbench.ai, current version;
entries are agent+model — preserve all exact-effort/harness entries, category
"agents"), MathArena (latest qualifying round, "reasoning"). Do not double-count
correlated rounds; verify checkpoint metadata, not just display names. Also check whether
SWE-bench (swebench.com), Aider polyglot, LiveCodeBench, SWE-rebench and METR
time horizons, Senior SWE-Bench, tau-bench and OSWorld have current exact-version
coverage. Senior uses canonical client task filtering/statistics; branded EAP
previews cannot become released Fable scores. Include qualifying boards if so,
otherwise list them under staleOrSkipped with the reason.
```

## 4. Artificial Analysis → `artificial-analysis.json`

Regenerate the two AA sources (Intelligence Index "overall", Coding Agent Index
"coding") from raw embedded Flight JSON, preserving every variant and full
precision. A single-row fallback snapshot cannot recover all effort runs.
Refresh `benchmarks/snapshot-aa.js` from the same pull (roster id mapping:
`claude-4-5-haiku-reasoning → claude-haiku-4-5`, `gemini-3-1-pro-preview → gemini-3-1-pro`).
