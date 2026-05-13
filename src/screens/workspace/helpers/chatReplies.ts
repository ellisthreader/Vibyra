const GREETING_RE = /^(?:hi+|hello+|hey+|yo+|sup|hiya|howdy|morning|afternoon|evening|gm|gn|good\s+(?:morning|afternoon|evening|day))[\s!.?…]*$/i;

const SMALL_TALK_TOKEN = String.raw`(?:thanks?|thank\s*you|thank\s*u|tysm|ty|thx|tnx|cheers|appreciate(?:d|\s+it)?|cool|nice|great|awesome|perfect|lovely|got\s+it|gotcha|sounds?\s+good|ok+|okay|okie|kk|k|mk|alright|alrighty|all\s+right|aight|right|sure|nvm|never\s*mind|fine|good|all\s+good|im\s+good|i'?m\s+good|we'?re\s+good|we\s+good|you'?re\s+good|it'?s\s+(?:fine|cool|ok(?:ay)?|all\s+good|good)|its\s+(?:fine|cool|ok(?:ay)?|good)|that'?s\s+(?:fine|ok(?:ay)?|cool|good)|forget\s+it|drop\s+it|skip\s+it|leave\s+it|no\s+worries|no\s+worry|no\s+thanks?|no\s+thank\s*you|no\s+prob(?:lem|s)?|no\s+need(?:ed)?|not\s+needed|don'?t\s+worry|dont\s+worry|bye|byebye|bye\s+bye|cya|see\s+ya|see\s+you|later|peace|good\s*bye|goodbye|not\s+now|maybe\s+later|next\s+time|i'?ll\s+come\s+back\s+later|ill\s+come\s+back\s+later|then)`;
const SMALL_TALK_TRAIL = String.raw`[\s!.?,…:;)(\-]*`;
const SMALL_TALK_SEP = String.raw`[\s,!.?…:;)(\-]+`;
const SMALL_TALK_TOKENS_RE = new RegExp(`^${SMALL_TALK_TRAIL}(?:${SMALL_TALK_TOKEN})(?:${SMALL_TALK_SEP}(?:${SMALL_TALK_TOKEN}))*${SMALL_TALK_TRAIL}$`, "i");

const SMALL_TALK_LEAD_RE = /^(?:(?:ok+|okay|kk|alright|all\s+right|aight|right|cool|nice|hmm+|um|uh|well|so|actually|just|maybe|please|pls|plz|yeah|yep|yup|ya|nah|nope|no|hey|hi|hello)[\s,!.?-]+)+/i;

const CONFUSION_RE = /^(?:i\s*(?:do\s*n'?t|don'?t|dont|do\s+not)\s*(?:get|understand|follow|know\s+what(?:'?s|\s+is)?(?:\s+(?:going\s+on|happening))?)|i'?m\s+(?:lost|confused|stuck)|confused|lost|huh\??|wat\??|wut\??|wha+t\??|sorry,?\s*what|no\s+idea|what\s+does\s+(?:that|this)\s+mean|i\s+don'?t\s+understand|\?+)[\s!.?…]*$/i;

const HELP_RE = /^(?:help(?:\s+me)?|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+(?:do|does|can)\s+(?:i|this|it)\s+(?:work|use)|how\s+do\s+i\s+(?:start|use|begin|get\s+started)|how\s+does\s+this\s+work|what\s+is\s+this|tutorial|guide|commands?|options?)[\s?!.]*$/i;

const VIEW_VERB = String.raw`(?:view|see|show(?:\s+me)?|open(?:\s+up)?|preview|launch|run|load|check\s+out|pull\s+up|bring\s+up)`;
const VIEW_TARGET = String.raw`(?:website|web\s*site|webpage|web\s*page|site|page|app|preview|index\.html|html|build|live\s+preview|live\s+site)`;
const VIEW_INTENT_RE = new RegExp(String.raw`\b${VIEW_VERB}\b[\s\S]{0,30}?\b${VIEW_TARGET}\b`, "i");
const VIEW_ON_DEVICE_RE = /\b(?:view|see|show|open|preview|launch|run|load|check\s+out|pull\s+up|bring\s+up)\b[\s\S]{0,30}?\b(?:on\s+(?:my\s+)?(?:phone|device|mobile)|in\s+(?:my\s+)?browser|in\s+a\s+browser)\b/i;

const CREATE_VERB = String.raw`(?:make|create|start|new|add|build|spin\s+up|set\s*up)`;
const PROJECT_NOUN = String.raw`(?:projects?|workspaces?|repos?|repositor(?:y|ies)|apps?)`;
const CREATE_PROJECT_RE = new RegExp(
  String.raw`\b${CREATE_VERB}\b(?:\s+(?:me|us|a|an|the|some|new|another|my))*?(?:\s+\w+){0,3}?\s+${PROJECT_NOUN}\b`,
  "i"
);
const NEW_PROJECT_RE = new RegExp(String.raw`\bnew\s+${PROJECT_NOUN}\b`, "i");
const CAN_I_PROJECT_RE = new RegExp(
  String.raw`\b(?:can|could|how\s+do|how\s+can|let\s+me|i\s+want\s+to|i\s+wanna|i'?d\s+like\s+to)\b[\s\S]{0,40}?\b${PROJECT_NOUN}\b`,
  "i"
);

export function isGreeting(prompt: string): boolean {
  return GREETING_RE.test(prompt.trim());
}

export function isSmallTalk(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (SMALL_TALK_TOKENS_RE.test(text)) return true;
  const stripped = text.replace(SMALL_TALK_LEAD_RE, "").trim();
  if (stripped && stripped !== text && SMALL_TALK_TOKENS_RE.test(stripped)) return true;
  return false;
}

export function isConfusion(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (CONFUSION_RE.test(trimmed)) return true;
  if (/^\?+$/.test(trimmed)) return true;
  return false;
}

export function isHelpRequest(prompt: string): boolean {
  return HELP_RE.test(prompt.trim());
}

export function isCreateProjectIntent(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (NEW_PROJECT_RE.test(text)) return true;
  if (CREATE_PROJECT_RE.test(text)) return true;
  if (CAN_I_PROJECT_RE.test(text) && /\b(?:make|create|start|new|build|add|spin|set\s*up)\b/i.test(text)) return true;
  return false;
}

export function greetingReply(): string {
  return "Hey! Want to jump into a project? Pick one from the Projects tab, or tell me a folder name on your PC (like `open folder test1`) and I'll go find it.";
}

export function smallTalkReply(): string {
  return "All good — whenever you're ready, open a project from the Projects tab or ask me to find a folder on your PC.";
}

export function confusionReply(): string {
  return "No worries, my fault. Here's the quick version — from this chat you can:\n• Open an existing project from the **Projects** tab.\n• Tell me a folder name on your PC, e.g. `open folder test1`, and I'll find it.\n• Ask `where am I?` to see what's currently selected.\nWhich one sounds right?";
}

export function helpReply(): string {
  return "Here's what I can do from this chat:\n• `create a project` — create a new folder on your PC and open it here.\n• `open folder <name>` — search your PC for that folder and open it here.\n• `where am I?` — show the project and file currently selected.\n• Once a project is open, I can read, edit, and build with the AI agent.";
}

export function createProjectReply(): string {
  return "Sure. I can create a project from here, open it in chat, then ask what kind of product and stack you want to start with.";
}

export function detachedFallbackReply(): string {
  return "I didn't quite catch that. You can:\n• Open a project from the **Projects** tab.\n• Say `open folder <name>` to find a folder on your PC.\n• Ask `where am I?` or `help` to see what I can do.";
}

export function isViewPreviewIntent(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (/^preview$/i.test(text)) return true;
  if (/\bopen\s+(?:in|with)\s+(?:my\s+|the\s+|a\s+)?browser\b/i.test(text)) return true;
  if (VIEW_ON_DEVICE_RE.test(text)) return true;
  if (VIEW_INTENT_RE.test(text)) return true;
  return false;
}

export function isPreviewTroubleIntent(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const mentionsBlank = /\b(?:blank|empty|nothing|white\s+screen|black\s+screen|not\s+showing|can'?t\s+see|cannot\s+see|won'?t\s+load|doesn'?t\s+load)\b/i.test(text);
  const mentionsPreview = /\b(?:preview|page|website|site|app|html|content|screen|load|see|view)\b/i.test(text);
  return mentionsBlank && mentionsPreview;
}

export function previewOpeningReply(projectName: string): string {
  return `Ready to preview ${projectName} — tap the preview below to open it.`;
}

export function previewTroubleReply(projectName: string): string {
  return `Let's check ${projectName} directly. Tap the preview below; if it still looks blank, the generated index.html may be empty or the desktop preview route may be unreachable from this phone.`;
}

export function previewNotConnectedReply(projectName: string): string {
  return `I'd love to preview ${projectName} on your phone, but Vibyra Desktop has to be running and paired first. Open Vibyra Desktop on your PC, pair this app, then ask again.`;
}

export function previewNeedsProjectReply(): string {
  return "To preview a website I need a project attached to this chat. Open one from the **Projects** tab first, then ask me to view it.";
}

export function bareNameClarifyReply(name: string): string {
  return `Did you mean a folder called \`${name}\`? Say \`open folder ${name}\` and I'll look on your PC.`;
}
