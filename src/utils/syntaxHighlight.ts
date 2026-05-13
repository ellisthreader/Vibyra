export type TokenKind =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "property"
  | "boolean"
  | "punctuation"
  | "default";

export type SyntaxToken = { text: string; kind: TokenKind };

export const SYNTAX_COLORS: Record<TokenKind, string> = {
  keyword: "#C586C0",
  string: "#CE9178",
  number: "#B5CEA8",
  comment: "#6A9955",
  function: "#DCDCAA",
  type: "#4EC9B0",
  property: "#9CDCFE",
  boolean: "#569CD6",
  punctuation: "#D4D4D4",
  default: "#E5E2F0",
};

type Family = "js" | "json" | "py" | "css" | "html" | "plain";

const FAMILY_BY_LANG: Record<string, Family> = {
  ts: "js", tsx: "js", typescript: "js",
  js: "js", jsx: "js", javascript: "js", mjs: "js", cjs: "js",
  json: "json", jsonc: "json",
  py: "py", python: "py",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html", xml: "html", svg: "html",
};

const JS_KEYWORDS = new Set([
  "import", "export", "from", "default", "const", "let", "var", "function",
  "return", "if", "else", "for", "while", "do", "switch", "case", "break",
  "continue", "class", "extends", "new", "this", "super", "async", "await",
  "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of",
  "void", "delete", "yield", "interface", "type", "enum", "implements",
  "public", "private", "protected", "readonly", "static", "as", "is",
  "namespace", "declare", "abstract", "keyof", "infer", "satisfies",
]);

const JS_BOOLEANS = new Set(["true", "false", "null", "undefined"]);

const PY_KEYWORDS = new Set([
  "def", "class", "if", "elif", "else", "for", "while", "return", "import",
  "from", "as", "with", "try", "except", "finally", "raise", "pass", "break",
  "continue", "lambda", "and", "or", "not", "is", "in", "global", "nonlocal",
  "async", "await", "yield",
]);

const PY_BOOLEANS = new Set(["True", "False", "None"]);

export function languageFamily(lang: string): Family {
  return FAMILY_BY_LANG[lang.trim().toLowerCase()] ?? "plain";
}

export function tokenize(code: string, lang: string): SyntaxToken[] {
  switch (languageFamily(lang)) {
    case "js": return tokenizeJs(code);
    case "json": return tokenizeJson(code);
    case "py": return tokenizePy(code);
    case "css": return tokenizeCss(code);
    case "html": return tokenizeHtml(code);
    default: return [{ text: code, kind: "default" }];
  }
}

function tokenizeJs(code: string): SyntaxToken[] {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.])|(\s+)|([\s\S])/gy;
  const tokens: SyntaxToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [text, comment, str, num, ident, punct] = m;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (str) tokens.push({ text, kind: "string" });
    else if (num) tokens.push({ text, kind: "number" });
    else if (ident) {
      let kind: TokenKind = "default";
      if (JS_KEYWORDS.has(text)) kind = "keyword";
      else if (JS_BOOLEANS.has(text)) kind = "boolean";
      else if (code.charAt(re.lastIndex) === "(") kind = "function";
      else if (/^[A-Z]/.test(text)) kind = "type";
      tokens.push({ text, kind });
    } else if (punct) tokens.push({ text, kind: "punctuation" });
    else tokens.push({ text, kind: "default" });
  }
  return tokens;
}

function tokenizeJson(code: string): SyntaxToken[] {
  const re = /("(?:[^"\\\n]|\\.)*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(true|false|null)|([{}[\]:,])|(\s+)|([\s\S])/gy;
  const tokens: SyntaxToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [text, str, num, lit, punct] = m;
    if (str) {
      let j = re.lastIndex;
      while (j < code.length && /\s/.test(code[j])) j++;
      tokens.push({ text, kind: code[j] === ":" ? "property" : "string" });
    } else if (num) tokens.push({ text, kind: "number" });
    else if (lit) tokens.push({ text, kind: "boolean" });
    else if (punct) tokens.push({ text, kind: "punctuation" });
    else tokens.push({ text, kind: "default" });
  }
  return tokens;
}

function tokenizePy(code: string): SyntaxToken[] {
  const re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)|([{}()[\]:,.])|(\s+)|([\s\S])/gy;
  const tokens: SyntaxToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [text, comment, str, num, ident, punct] = m;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (str) tokens.push({ text, kind: "string" });
    else if (num) tokens.push({ text, kind: "number" });
    else if (ident) {
      let kind: TokenKind = "default";
      if (PY_KEYWORDS.has(text)) kind = "keyword";
      else if (PY_BOOLEANS.has(text)) kind = "boolean";
      else if (code.charAt(re.lastIndex) === "(") kind = "function";
      else if (/^[A-Z]/.test(text)) kind = "type";
      tokens.push({ text, kind });
    } else if (punct) tokens.push({ text, kind: "punctuation" });
    else tokens.push({ text, kind: "default" });
  }
  return tokens;
}

function tokenizeCss(code: string): SyntaxToken[] {
  const re = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#(?:[0-9a-f]{3,8})\b)|(\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)|(--?[A-Za-z_][\w-]*)(?=\s*:)|([.#]?[A-Za-z_][\w-]*)|([{}()[\]:;,>+~*=])|(\s+)|([\s\S])/giy;
  const tokens: SyntaxToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [text, comment, str, hex, num, prop, ident, punct] = m;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (str || hex) tokens.push({ text, kind: "string" });
    else if (num) tokens.push({ text, kind: "number" });
    else if (prop) tokens.push({ text, kind: "property" });
    else if (ident) tokens.push({ text, kind: text.startsWith(".") || text.startsWith("#") ? "function" : "default" });
    else if (punct) tokens.push({ text, kind: "punctuation" });
    else tokens.push({ text, kind: "default" });
  }
  return tokens;
}

function tokenizeHtml(code: string): SyntaxToken[] {
  const re = /(<!--[\s\S]*?-->)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\/?[A-Za-z][\w:-]*)|([<>/=])|(\s+)|([\s\S])/gy;
  const tokens: SyntaxToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [text, comment, str, tag, punct] = m;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (str) tokens.push({ text, kind: "string" });
    else if (tag) tokens.push({ text, kind: text.startsWith("/") ? "punctuation" : "type" });
    else if (punct) tokens.push({ text, kind: "punctuation" });
    else tokens.push({ text, kind: "default" });
  }
  return tokens;
}

export function diffCounts(code: string): { added: number; removed: number; isDiff: boolean } {
  if (!code) return { added: 0, removed: 0, isDiff: false };
  const lines = code.split("\n");
  const isDiff = lines.some((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  if (!isDiff) return { added: lines.length, removed: 0, isDiff: false };
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (/^\+\+\+/.test(line) || /^---/.test(line)) continue;
    if (/^\+/.test(line)) added++;
    else if (/^-/.test(line)) removed++;
  }
  return { added, removed, isDiff: true };
}
