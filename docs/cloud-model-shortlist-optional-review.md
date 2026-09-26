# Optional cloud model shortlist review — 26 September 2026

This draft change is stacked on the owner analytics review branch for inspection only. It is a separate model and funding decision. The analytics release archive is unchanged, and this branch has not been merged or deployed.

## Scope and observed behavior

The current iPhone picker and shipped phone web bundle list GPT-6 Sol, GPT-6 Luna, and Claude Opus 5.5. The running-source backend baseline omitted those three IDs from `config/vibes_auto.php` and `Auto/Profiles.php`, so the shortlist parity guard failed. This commit adds explicit profiles and the same ordered IDs; it also adds their curated names/blurbs to `config/vibes.php`.

Auto still requires a current OpenRouter pricing snapshot, supported tools/vision when needed, context fit, and available Vibes before it can choose a model. The proposed profiles are routing preferences, not benchmark claims. In a published-price-shaped fixture, “Review and refactor the entire codebase” selected GPT-6 Sol at low effort and 6 reserved Vibes; the baseline selected Opus 5 at low effort and 14 reserved Vibes. Three simpler sample turns kept their former winners. Actual live routes and costs must be rechecked after release.

## Funding and legacy billing

All three models remain paid-only for Vibes trial credit, matching the current mobile offline catalogue and production's uncurated behavior. Sol ($2 input/$10 output per million) and Opus 5.5 ($4/$20) exceed the current $1/$5 trial ceiling. Luna ($0.10/$0.50) sits below it, so `vibes.trial_paid_only` explicitly keeps it locked after curation. `Catalog::includedFree`, the public menu, trial-only Auto, and a trial quote/submission check use that same decision; submission returns 402. Removing Luna from this exception would be a separate funding change.

Legacy billing gains only the short aliases `gpt-6-sol`, `gpt-6-luna`, and `claude-opus-5.5`. They map to the published full OpenRouter slugs with the same tier and multiplier that dynamic full-slug billing derives at the reviewed prices. The full slugs remain dynamically priced; no new fallback prices or plan entitlements were added. A future provider price change can make a pinned short alias tier differ from a dynamic full slug, so review the aliases with each model pricing update.

Model evidence checked on 2026-09-26: [OpenAI API models](https://developers.openai.com/api/docs/models), [OpenRouter Sol](https://openrouter.ai/openai/gpt-6-sol/), [OpenRouter Luna](https://openrouter.ai/openai/gpt-6-luna/), [OpenRouter Opus 5.5](https://openrouter.ai/anthropic/claude-opus-5.5/), [Anthropic announcement](https://www.anthropic.com/claude-opus-5-5/).

## Validation and release boundary

- Full backend suite on the rebased branch: 912 tests, 6,513 assertions, no failures/errors; four PHPUnit notices and one skip. The isolated harness used this exact branch backend with the **current** mobile picker source and current production root Railway topology. The analytics base now checks in the 24-ID mobile picker fixture; the current picker was injected to verify that fixture against the live source tree.
- Focused Auto, trial, and billing suite on the rebased branch: 23 tests, 180 assertions; current mobile model group/picker suite: 22 tests passed. Both billing and Vibes economics audits passed before the rebase; no model or billing runtime code changed in the analytics base.
- The optional branch does not replace the analytics-only archive. Before any model release, review trial policy and Auto preference values, verify fresh live prices/tool metadata and paid/trial quotes, and complete the independent production release gates.
