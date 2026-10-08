# Desktop catalogues

`en.json` is the source: its keys are the type of every `t("key")` call. The other
files are flat key/value JSON with the same keys, in the languages below.

| File | Language | Status |
| --- | --- | --- |
| `es.json` | Spanish | machine draft, needs native review |
| `fr.json` | French | machine draft, needs native review |
| `de.json` | German | machine draft, needs native review |
| `ja.json` | Japanese | machine draft, needs native review |
| `zh-Hans.json` | Simplified Chinese | machine draft, needs native review |
| `pt-BR.json` | Portuguese (Brazil) | machine draft, needs native review |

**Every non-English catalogue was drafted by a model (2026-10-02) and has not been read by a
native speaker.** Do not call a language finished, or list it in marketing, until a native
reviewer has signed it off here. Right-to-left languages and Traditional Chinese are not
supported yet.

## Rules

- A key missing from a language shows the English text, so a language can ship partly done.
- Messages use an ICU subset: `{name}`, `{n, number}`, `{d, date}`,
  `{n, plural, =0 {..} one {# file} other {# files}}` and `{x, select, a {..} other {..}}`.
  Plural categories come from the platform's `Intl.PluralRules`. Always write `other`.
- An apostrophe quotes only before `{` or `}`; write `''` for a literal one next to a brace.
  Literal braces are written `'{{'project'}}'` (the prompt variables).
- Keep placeholders as they are; `tests/i18n.test.mjs` fails on a missing, extra or renamed one.
- Do not translate `Vibyra`, `AGENTS.md`, `Pro`, or the `{{project}}` / `{{date}}` variables.
- Dates and numbers are never formatted by hand: use `dateText` / `numberText` (platform `Intl`).
- The language is chosen in Settings > General > Language and kept in `localStorage`
  (`vibyra.locale`). English is the default until a person picks another or "Match system".

## Adding a screen

Convert a whole file at a time: `const t = useT()`, then `t("area.key")`. Add the file to the
list in `tests/i18n.test.mjs` so the pseudo-locale scan keeps it free of hard-coded text.
Do not convert a file another change is still rewriting.

## Not yet converted

Anything not named in `tests/i18n.test.mjs` is still English. Known gaps: the worktree
review screens, spend-limit cards, trigger editors, the local MCP block, Live Activity
settings, and the rest of Settings (Accounts, Notifications, Phone, Shortcuts, Account,
Advanced).
