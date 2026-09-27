// Finding the model a person meant. They say "GPT astra", "gptastra" or
// "chat GPT astra 6"; the launcher wants `openai/gpt-6-astra`. This is pure so
// the ladder below can be tested against the real catalogue names rather than
// guessed at, because getting it wrong opens the wrong thing silently.

export interface NamedModel {
  id: string;
  label: string;
  company?: string;
}

/** Words people put around a model name that are never part of one. */
const FILLER = new Set([
  "chat", "model", "models", "the", "a", "an", "with", "using", "use", "on",
  "in", "for", "please", "pls", "terminal", "terminals", "agent", "version",
]);

const letters = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokens = (value: string) =>
  (value.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []).filter((token) => !FILLER.has(token));

/**
 * The best match, or null when nothing is close enough to act on. A wrong
 * model launched silently is worse than being told the name was not found, so
 * this would rather return null than guess.
 *
 * The ladder, loosest last: the exact name, the same name written without
 * punctuation, the same letters with the numbers dropped ("GPT astra" for
 * "GPT-6 Astra"), one name contained in the other ("chat GPT astra 6"), and
 * finally a word-by-word score.
 */
export function matchModel<T extends NamedModel>(name: string, models: T[]): T | null {
  const wanted = name.trim();
  if (!wanted || !models.length) return null;

  const exact = models.find((model) => model.label.toLowerCase() === wanted.toLowerCase());
  if (exact) return exact;

  const flat = squash(wanted);
  const byId = models.find((model) => squash(model.id) === flat || squash(model.label) === flat);
  if (byId) return byId;

  // Numbers are what separates one generation from the next, so a query that
  // names one only matches a candidate carrying it.
  const wantedDigits = wanted.match(/\d+(?:\.\d+)?/g) ?? [];
  const carriesDigits = (model: T) =>
    wantedDigits.every((digit) => model.label.includes(digit) || model.id.includes(digit));

  const plain = letters(wanted);
  const sameLetters = models.filter(
    (model) => letters(model.label) === plain || letters(model.id).endsWith(plain),
  );
  const lettered = sameLetters.find(carriesDigits) ?? sameLetters[0];
  if (lettered) return lettered;

  const contained = models.filter((model) => {
    const label = letters(model.label);
    return label.length >= 4 && (plain.includes(label) || label.includes(plain));
  });
  const within = contained.find(carriesDigits) ?? contained[0];
  if (within) return within;

  return byWords(tokens(wanted), models, carriesDigits);
}

/** Every word of the query found in the name, most words first. One word is
 * only enough when it is a real word rather than a letter or two. */
function byWords<T extends NamedModel>(
  wanted: string[],
  models: T[],
  carriesDigits: (model: T) => boolean,
): T | null {
  if (!wanted.length) return null;
  let best: { model: T; hits: number; extra: number } | null = null;
  for (const model of models) {
    const have = new Set([...tokens(model.label), ...tokens(model.id)]);
    const hits = wanted.filter((word) => have.has(word)).length;
    if (!hits) continue;
    const extra = have.size - hits;
    const better =
      !best ||
      hits > best.hits ||
      (hits === best.hits && carriesDigits(model) && !carriesDigits(best.model)) ||
      (hits === best.hits && extra < best.extra);
    if (better) best = { model, hits, extra };
  }
  if (!best) return null;
  const enough = best.hits >= 2 || (best.hits === 1 && wanted.some((word) => word.length >= 4));
  return enough ? best.model : null;
}

/** Which CLI can run a model, when the person named the model and not the
 * agent. "Three terminals of GPT-6 Astra" says everything needed. */
export function agentForModel(model: NamedModel): string | null {
  const from = `${model.company ?? ""} ${model.id}`.toLowerCase();
  if (from.includes("openai") || from.includes("gpt")) return "codex";
  if (from.includes("anthropic") || from.includes("claude")) return "claude";
  if (from.includes("google") || from.includes("gemini")) return "gemini";
  return null;
}
