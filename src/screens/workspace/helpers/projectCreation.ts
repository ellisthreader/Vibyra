export type ProjectCreationIntent = {
  name?: string;
  seedPrompt?: string;
};

const CREATE_VERB = String.raw`(?:build|create|make|start|new|add|generate|scaffold|bootstrap|spin\s+up|set\s*up)`;
const PROJECT_WORD = String.raw`(?:project|workspace|repo|repository|codebase)`;
const PRODUCT_WORD = String.raw`(?:app|application|website|web\s*site|site|web\s*app|game|api|backend|dashboard|landing\s+page|portfolio|store|shop|blog|tool|chatbot|bot|script|automation|saas|crm|platform)`;
const DIRECT_PROJECT_RE = new RegExp(String.raw`\b${CREATE_VERB}\b[\s\S]{0,80}\b${PROJECT_WORD}s?\b`, "i");
const NEW_PROJECT_RE = new RegExp(String.raw`\bnew\s+${PROJECT_WORD}\b`, "i");
const PRODUCT_RE = new RegExp(String.raw`\b${CREATE_VERB}\b[\s\S]{0,100}\b${PRODUCT_WORD}\b`, "i");
const WANT_PRODUCT_RE = new RegExp(String.raw`\b(?:i\s+(?:want|need|wanna|would\s+like)|can\s+you|could\s+you|please)\b[\s\S]{0,80}\b(?:${CREATE_VERB}|${PRODUCT_WORD})\b`, "i");
const NAMED_RE = /\b(?:called|named|titled|name(?:\s+it|\s+is)?|for)\s+["'`]?([a-z0-9][\w &.-]{1,70})["'`]?/i;
const QUOTED_RE = /["'`]([^"'`]{2,80})["'`]/;
const GENERIC_PROJECT_RE = new RegExp(String.raw`\b(?:a|an|the|new|blank|fresh|empty|simple|basic|starter|another|my|me|us|some)\s+${PROJECT_WORD}\b`, "i");

export function projectCreationIntent(prompt: string): ProjectCreationIntent | null {
  const text = prompt.trim();
  if (!text) return null;
  const directProject = DIRECT_PROJECT_RE.test(text) || NEW_PROJECT_RE.test(text);
  const productRequest = PRODUCT_RE.test(text) || WANT_PRODUCT_RE.test(text);
  if (!directProject && !productRequest) return null;

  const name = projectNameFromPrompt(text, productRequest);
  return {
    ...(name ? { name } : {}),
    ...(productRequest ? { seedPrompt: text } : {})
  };
}

export function projectCreationFailedReply() {
  return "I couldn't create the project. Try again in a moment.";
}

function projectNameFromPrompt(text: string, productRequest: boolean) {
  const quoted = text.match(QUOTED_RE)?.[1];
  if (quoted) return cleanProjectName(quoted);

  const named = text.match(NAMED_RE)?.[1];
  if (named) return cleanProjectName(named);

  if (!productRequest || GENERIC_PROJECT_RE.test(text)) return undefined;
  const product = text.match(new RegExp(String.raw`\b${CREATE_VERB}\b\s+(?:me\s+|us\s+|a\s+|an\s+|the\s+|new\s+|simple\s+|basic\s+)?([a-z0-9][\w &.-]{1,70}?\s+${PRODUCT_WORD})\b`, "i"))?.[1];
  return product ? cleanProjectName(product) : undefined;
}

function cleanProjectName(raw: string) {
  const cleaned = raw
    .replace(/\b(?:with|using|that|which|where|for\s+me|please|pls|plz|now|today)\b[\s\S]*$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(?:project|workspace|repo|repository|app|website|site)$/i.test(cleaned)) return undefined;
  return cleaned.slice(0, 70);
}
