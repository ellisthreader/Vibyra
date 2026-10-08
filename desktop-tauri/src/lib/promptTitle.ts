// A short pane name taken from the first thing the person asked, for agents
// that do not name their own conversations. Claude and Codex do, and their
// names replace this one (see `paneTitles.ts`), so this only has to be a
// reasonable label — never a summary it cannot honestly make.

const MAX_WORDS = 7;
const MAX_CHARS = 44;

// Said to the agent, not about the work: "hey, can you please …".
const LEADING_FILLER = [
  /^(?:hi|hey|hello|yo)\b(?:\s+(?:claude|codex|gemini|gpt|there|team|all|everyone))?[\s,.!:-]*/i,
  /^(?:claude|codex|gemini)\b[\s,:-]+/i,
  /^(?:ok(?:ay)?|so|well|right|alright|now|also|then|and|just|actually|quick(?:ly)?|yeah|yes|yep|yup|sure)\b[\s,.!:-]*/i,
  /^(?:please|pls|kindly)\b[\s,]*/i,
  /^(?:can|could|would|will)\s+(?:you|u)\b(?:\s+(?:please|pls|kindly))?[\s,]*/i,
  /^(?:i|we)\s+(?:want|need|would like|'d like|'d love|wish|am trying|are trying)\s+(?:you\s+)?(?:to\s+)?/i,
  /^(?:i['’]d|we['’]d)\s+(?:like|love)\s+(?:you\s+)?(?:to\s+)?/i,
  /^let['’]?s\s+(?:try\s+to\s+)?/i,
  /^(?:help me|help us)\s+(?:to\s+)?/i,
  /^go ahead and\s+/i,
  /^(?:try|try to|make sure to|be sure to)\s+/i,
];

// Pleasantries name no work: "how are you doing", "hoe are u oing boss", "thanks".
const SMALL_TALK = /^(?:ho[we]?\s+(?:are|r|is|was)\b|how['’]?s\b|what['’]?s\s+up|sup\b|thanks|thank\s+(?:you|u)|thx|cheers|good\s+(?:morning|afternoon|evening|night)|morning\b|hello|hiya|hey|hi\b)/i;

// Punctuation, arrows and path slashes a title must not end on.
const TRAILING_MARKS = /[\s.,:;!?\-–—→⇒>/\\|]+$/u;

const TRAILING_FILLER = /[\s,]+(?:please|pls|thanks|thank you|thx|for me|if you can|if possible|asap)\s*[.!?]*$/i;

// Where a request turns from what it is about to how or why: "fix the hero,
// it overlaps…", "audit the Mac app I want you to…". Spoken requests rarely
// have a full stop, so these stand in for one.
const CLAUSE_BREAK = /\s*[,;:]\s|\s[-–—→⇒]\s|\s(?:and\s+)?(?:i|we)\s+(?:want|need|would|think|['’]d)\b|\s(?:and|it|currently|so that|so it|because|but|when|where|which)\s/i;

// Asking to look at something names the thing, not the looking: "go through
// the whole vibyra mac software" is about "Vibyra mac software".
const SURVEY = /^(?:review|go\s+(?:through|over|on|into)|look\s+(?:at|into|over|through)|(?:have|take)\s+a\s+look\s+(?:at|into)|analy[sz]e)\s+(?:(?:the|my|our|this|these|those)\s+)?(?:(?:whole|entire|current|latest|absolute|full|other)\s+)*/i;

// Words a title must not end on once it has been cut short.
const DANGLING = new Set([
  "a", "an", "the", "to", "of", "and", "or", "but", "for", "in", "on", "at", "by", "with", "from", "into",
  "that", "this", "these", "those", "it", "its", "is", "are", "be", "as", "so", "then", "my", "our", "your",
  "me", "us", "i", "we", "you", "if", "when", "while", "than", "also", "can", "could", "should", "would", "will",
  "what", "how", "who",
]);

/** The cleaned start of the request as a title, or null when it holds no words worth showing. */
export function titleFromPrompt(prompt: string | null | undefined): string | null {
  if (!prompt) return null;
  let text = prompt
    .replace(/https?:\/\/\S+/gi, ", ")
    .replace(/[`*_#>]+/g, " ")
    .replace(/\b(?:please|pls|kindly)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+/, "")
    .trim();
  // The first sentence is what the request is; the rest is detail.
  text = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)[0] ?? text;
  for (let pass = 0, changed = true; changed && pass < 8; pass++) {
    changed = false;
    for (const filler of LEADING_FILLER) {
      const next = text.replace(filler, "");
      if (next !== text) { text = next; changed = true; }
    }
  }
  if (SMALL_TALK.test(text) && text.split(" ").length <= 6) return null;
  const head = text.split(CLAUSE_BREAK)[0];
  // "review frontend and launch 5 subagents" is about reviewing the frontend.
  const cut = head !== text && head.split(" ").length >= (SURVEY.test(head) ? 2 : 3);
  if (cut) text = head;
  const subject = text.replace(SURVEY, "").replace(/^[\s,;:]+/, "");
  if (subject !== text && subject.includes(" ")) text = subject;
  text = text.replace(TRAILING_FILLER, "").replace(TRAILING_MARKS, "").trim();
  if (!/\p{L}{2}/u.test(text)) return null;
  // One short word ("yes", "ok") answers something; it does not name work.
  if (!text.includes(" ") && text.length < 6) return null;

  const words = text.split(" ");
  const kept = words.slice(0, MAX_WORDS);
  while (kept.length > 1 && kept.join(" ").length > MAX_CHARS) kept.pop();
  if (cut || kept.length < words.length) {
    while (kept.length > 1 && DANGLING.has(kept[kept.length - 1].toLowerCase().replace(/[^a-z']/g, ""))) kept.pop();
  }
  let title = kept.join(" ").replace(TRAILING_MARKS, "");
  if (title.length > MAX_CHARS) title = title.slice(0, MAX_CHARS).trimEnd();
  if (title.length < 3) return null;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * An agent-written name made safe to show: one line, no wrapping quotes,
 * bounded, and read like the others — a slug such as "preview-device-overhaul"
 * becomes "Preview device overhaul".
 */
export function cleanNativeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  let clean = title.replace(/\s+/g, " ").trim().replace(/^["'“‘`]+|["'”’`]+$/g, "").trim();
  if (!clean.includes(" ") && /\p{L}[-_]\p{L}/u.test(clean)) clean = clean.replace(/[-_]+/g, " ");
  if (!/\p{L}/u.test(clean)) return null;
  // "cli view navigation" sits beside "Pricing page redesign"; "iOS fixes" stays as written.
  if (/^\p{Ll}+(?:\s|$)/u.test(clean)) clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  return clean.length > 80 ? `${clean.slice(0, 79).trimEnd()}…` : clean;
}

/**
 * What a pane's automatic title should be now. The agent's own name always
 * wins; a name made from the first request is only a stand-in until it exists,
 * and is never replaced by a later request — the conversation keeps its name
 * even when the person moves on to something else in it.
 */
export function nextAutoTitle(
  current: string | null,
  hint: { prompt?: string | null; nativeTitle?: string | null },
): string | null {
  const native = cleanNativeTitle(hint.nativeTitle);
  if (native) return native;
  return current ?? titleFromPrompt(hint.prompt);
}
