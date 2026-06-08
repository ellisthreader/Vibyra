# Desktop Action Evaluation Dataset

This deterministic JSONL corpus trains Vibyra's action-routing discipline by
turning natural-language examples into exact structured-action expectations.
It is a regression and future fine-tuning asset; runtime actions remain
validated deterministic code rather than executable model prose.

Regenerate and evaluate it with:

```bash
npm run desktop:ai:dataset
npm run test:desktop-ai
```

`cases.jsonl` is generated from `generate.mjs` and checked in. Every record has
a stable ID, prompt, context, expected result, and safety tier. Add a regression
example before fixing a newly reported prompt.
