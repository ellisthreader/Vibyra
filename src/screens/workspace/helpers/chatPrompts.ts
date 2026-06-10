export { currentProjectReply, desktopConnectionRequiredReply } from "./chatProjectReplies";

const FIND_VERBS = String.raw`(?:find|open|oepn|opne|opem|opn|oen|locate|use|switch(?:\s+to)?|select|go(?:\s+to)?|work\s+(?:on|in|with)|connect(?:\s+to)?|attach(?:\s+to)?|load|pick|choose|show(?:\s+me)?|view|get|grab|link(?:\s+to)?|hook\s+up|set\s+up|set|pull\s+up|bring\s+up|jump\s+(?:to|into)|head\s+(?:to|into))`;

const FOLDER_NOUN = String.raw`(?:folders?|forlders?|folderrs?|foders?|flder|foler|fold(?:re|r)|fodlers?|folers?|floders?|repos?(?:itory|itories)?|projec?ts?|projcts?|projets?|prjects?|proejcts?|director(?:y|ies)|diretor(?:y|ies)|directr(?:y|ies)|dirs?|apps?|codebases?|workspaces?|desktop|pc|computer|machine|src|source)`;

const FILE_NOUN = String.raw`(?:files?|fiels?|path)`;

const TARGET_NOUN = String.raw`(?:${FOLDER_NOUN}|${FILE_NOUN})`;

const FIND_VERB_RE = new RegExp(String.raw`\b${FIND_VERBS}\b`, "i");
const FOLDER_NOUN_RE = new RegExp(String.raw`\b${FOLDER_NOUN}\b`, "i");
const TARGET_NOUN_RE = new RegExp(String.raw`\b${TARGET_NOUN}\b`, "i");
const QUOTED_RE = /["'`“”‘’]([^"'`“”‘’]{1,120})["'`“”‘’]/;
const NAMED_RE = /\b(?:called|named|name\s+is|titled|labelled?)\b/i;

const STOP_NAMES = /^(?:a|an|the|some|any|it|me|my|you|your|that|this|one|please|pls|plz|thanks?|thank|ty|thx|tnx|tysm|cheers|yes|yeah|yep|yup|ya|no|nope|nah|not|ok|okay|kk|sure|hi|hey|hello|hiya|yo|sup|um|uh|so|well|maybe|just|actually|hmm|now|asap|fine|cool|nice|great|awesome|nvm|lol|lmao|aight|alright|right)$/i;

const FILLER_PREFIX = /^(?:(?:yes|yeah|yep|yup|ya|ok|okay|kk|sure|please|pls|plz|no|nope|not|nah|hi|hey|hello|hiya|yo|sup|um|uh|so|well|maybe|just|actually|hmm|alright|right|cool)\b[\s,.!?-]*)+/i;
const FILLER_TOKEN_RE = /^(?:a|an|the|some|any|it|me|my|you|your|that|this|one|please|pls|plz|thanks?|thank|ty|thx|tnx|tysm|cheers|yes|yeah|yep|yup|ya|no|nope|nah|not|ok|okay|kk|sure|hi|hey|hello|hiya|yo|sup|um|uh|so|well|maybe|just|actually|hmm|now|asap|fine|cool|nice|great|awesome|nvm|lol|lmao|aight|alright|right)$/i;

const QUESTION_PHRASE_RE = /\b(?:what|where|who|why|how|is|are|called|named|don'?t|dont|understand|confused|lost|help|mean)\b/i;

function stripFiller(text: string): string {
  return text.replace(FILLER_PREFIX, "").trim();
}

function cleanCandidateName(raw: string): string | null {
  let trimmed = raw
    .replace(/\b(?:on|in|from|inside|under|please|thanks?|thank\s+you|now|asap|for\s+me|pls|plz|its?|it'?s|that'?s|which\s+is|that\s+is|located|saved|stored|sitting|living)\b.*$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  trimmed = stripFiller(trimmed);
  trimmed = trimmed.replace(new RegExp(String.raw`^${FIND_VERBS}\b\s*`, "i"), "").trim();
  while (/\s/.test(trimmed)) {
    const tokens = trimmed.split(/\s+/);
    const last = tokens[tokens.length - 1];
    if (FILLER_TOKEN_RE.test(last) || /^(?:its?|it'?s|that'?s|thats|here|there|please|pls|plz)$/i.test(last)) {
      tokens.pop();
      trimmed = tokens.join(" ").trim();
    } else {
      break;
    }
  }
  if (!trimmed) return null;
  if (STOP_NAMES.test(trimmed)) return null;
  if (new RegExp(`^${TARGET_NOUN}$`, "i").test(trimmed)) return null;
  if (/^(?:me|my|you|your)\s+(?:a|an|the|some|any)?$/i.test(trimmed)) return null;
  if (trimmed.split(/\s+/).every((token) => FILLER_TOKEN_RE.test(token))) return null;
  return trimmed;
}

function cleanFileCandidate(raw: string): string | null {
  const trimmed = raw
    .replace(/\b(?:on|in|from|inside|under|please|thanks|thank you|now|asap)\b.*$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  if (!trimmed) return null;
  if (STOP_NAMES.test(trimmed)) return null;
  return trimmed;
}

export function desktopProjectSearchQuery(prompt: string): string {
  return extractFolderName(prompt) ?? "";
}

export function extractFolderName(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  const quoted = trimmed.match(QUOTED_RE);
  if (quoted?.[1]) {
    const c = cleanCandidateName(quoted[1]);
    if (c) return c;
  }

  const called = trimmed.match(/\b(?:called|named|name\s+is|titled|labelled?)\s+([a-z0-9][\w. -]{0,79})/i);
  if (called?.[1]) {
    const c = cleanCandidateName(called[1]);
    if (c) return c;
  }

  const verbNounName = trimmed.match(new RegExp(
    String.raw`\b${FIND_VERBS}\s+(?:to\s+)?(?:the\s+|a\s+|an\s+|my\s+|that\s+|this\s+)?${TARGET_NOUN}\s+(?:called\s+|named\s+)?([a-z0-9][\w. -]{0,79})`,
    "i"
  ));
  if (verbNounName?.[1]) {
    const c = cleanCandidateName(verbNounName[1]);
    if (c) return c;
  }

  const verbNameNoun = trimmed.match(new RegExp(
    String.raw`\b${FIND_VERBS}\s+(?:the\s+|a\s+|an\s+|my\s+|that\s+|this\s+)?([a-z0-9][\w. -]{0,79}?)\s+${TARGET_NOUN}\b`,
    "i"
  ));
  if (verbNameNoun?.[1]) {
    const c = cleanCandidateName(verbNameNoun[1]);
    if (c) return c;
  }

  const nounName = trimmed.match(new RegExp(
    String.raw`\b${TARGET_NOUN}\s+(?:called\s+|named\s+)?([a-z0-9][\w. -]{0,79})`,
    "i"
  ));
  if (nounName?.[1]) {
    const c = cleanCandidateName(nounName[1]);
    if (c) return c;
  }

  const trailing = trimmed.match(new RegExp(
    String.raw`\b([a-z0-9][\w. -]{0,79}?)\s+${TARGET_NOUN}\b`,
    "i"
  ));
  if (trailing?.[1]) {
    const cleaned = cleanCandidateName(trailing[1]);
    if (cleaned) return cleaned;
  }

  const stripped = stripFiller(trimmed);
  const verbName = stripped.match(new RegExp(String.raw`\b${FIND_VERBS}\s+([a-z0-9][\w.-]{1,80})`, "i"));
  if (verbName?.[1]) return cleanCandidateName(verbName[1]);

  return null;
}

export function extractFileName(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  const quoted = trimmed.match(/["'`“”‘’]([^"'`“”‘’]{1,120})["'`“”‘’]/);
  if (quoted?.[1]) return cleanFileCandidate(quoted[1]);

  const called = trimmed.match(/\b(?:file\s+)?(?:called|named|name\s+is)\s+([a-z0-9][\w./ -]{0,119})/i);
  if (called?.[1]) return cleanFileCandidate(called[1]);

  const fileAfterVerb = trimmed.match(/\b(?:open|find|locate|select|use|show|view)\s+(?:the\s+)?(?:file\s+)?([a-z0-9][\w./ -]{0,119}?\.[a-z0-9]{1,12})\b/i);
  if (fileAfterVerb?.[1]) return cleanFileCandidate(fileAfterVerb[1]);

  const namedFile = trimmed.match(/\b([a-z0-9][\w./ -]{0,119}?\.[a-z0-9]{1,12})\s+file\b/i);
  if (namedFile?.[1]) return cleanFileCandidate(namedFile[1]);

  return null;
}

export function isFindFolderIntent(prompt: string): boolean {
  if (NAMED_RE.test(prompt) && extractFolderName(prompt)) return true;
  if (!FOLDER_NOUN_RE.test(prompt) && !TARGET_NOUN_RE.test(prompt)) {
    return FIND_VERB_RE.test(prompt) && (QUOTED_RE.test(prompt) || NAMED_RE.test(prompt));
  }
  if (FIND_VERB_RE.test(prompt)) return true;
  if (QUOTED_RE.test(prompt)) return true;
  if (NAMED_RE.test(prompt)) return true;
  return false;
}

export function isOpenFileIntent(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const hasOpenVerb = /\b(open|find|locate|select|use|show|view)\b/.test(text);
  const mentionsNamedFile = /[a-z0-9][\w./ -]*\.[a-z0-9]{1,12}\b/i.test(prompt);
  const mentionsFile = /\b(file|path)\b/.test(text) || mentionsNamedFile;
  const mentionsLocalMachine = /\b(pc|desktop|computer|machine|project|repo|repository|folder|workspace)\b/.test(text);
  return hasOpenVerb && mentionsFile && (mentionsLocalMachine || mentionsNamedFile);
}

export function isProjectLookupOnly(prompt: string) {
  const text = prompt.toLowerCase();
  const asksForProject = isFindFolderIntent(prompt);
  const asksForCodeWork = /\b(build|add|change|fix|update|edit|refactor|implement|make|design|write|code|generate|remove|delete)\b/.test(text);
  return asksForProject && !asksForCodeWork;
}

export function isCurrentProjectQuestion(prompt: string) {
  const text = prompt.toLowerCase().trim();
  if (/^where\s+am\s+i(?:\s+(?:rn|right\s+now|now|currently))?\??$/i.test(text)) return true;
  if (/^(?:what|where)\s+(?:is|are)\s+(?:this|here|we|we\s+in)\??$/i.test(text)) return true;
  const asksWhere = /\b(where|what|which|are we|we are|currently|current|selected)\b/.test(text);
  const mentionsWorkspace = /\b(file|folder|project|repo|repository|directory|workspace|app)\b/.test(text);
  const asksForCodeWork = /\b(build|add|create|change|fix|update|edit|refactor|implement|make|design|write|code|generate|remove|delete)\b/.test(text);
  return asksWhere && mentionsWorkspace && !asksForCodeWork;
}

export function isBareName(prompt: string): boolean {
  const stripped = stripFiller(prompt.trim()).replace(/[?.!,;:]+$/g, "").trim();
  if (!stripped) return false;
  if (STOP_NAMES.test(stripped)) return false;
  if (FILLER_TOKEN_RE.test(stripped)) return false;
  if (/\s/.test(stripped)) return false;
  if (FIND_VERB_RE.test(stripped)) return false;
  if (TARGET_NOUN_RE.test(stripped)) return false;
  if (QUESTION_PHRASE_RE.test(stripped)) return false;
  if (!/^[a-z0-9][\w.-]{0,39}$/i.test(stripped)) return false;
  return true;
}

export function bareNameCandidate(prompt: string): string | null {
  const stripped = stripFiller(prompt.trim()).replace(/[?.!,;:]+$/g, "").trim();
  return isBareName(prompt) ? stripped : null;
}
