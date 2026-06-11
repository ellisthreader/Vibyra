const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const UNDERLINE = "\x1b[4m";
const CODE = "\x1b[38;2;245;192;120m";
const LINK = "\x1b[38;2;105;170;255m";
const HEADING = "\x1b[1;38;2;236;230;255m";

const BRAND_MARKS = {
  xai: ["X", "xAI"],
  deepseek: ["◒", "DEEPSEEK"],
  qwen: ["◈", "QWEN"],
  mistral: ["▟", "MISTRAL"],
  meta: ["∞", "META"],
  microsoft: ["⊞", "MICROSOFT"],
  cohere: ["●", "COHERE"],
  perplexity: ["⌘", "PERPLEXITY"],
  moonshot: ["◐", "KIMI"],
  zhipu: ["GLM", "Z.AI"],
  alibaba: ["A", "ALIBABA"],
  tencent: ["✦", "TENCENT"],
  baidu: ["✣", "BAIDU"],
  bytedance: ["♪", "BYTEDANCE"],
  xiaomi: ["MI", "XIAOMI"],
  nvidia: ["◉", "NVIDIA"],
  minimax: ["M", "MINIMAX"],
  amazon: ["a→", "AMAZON"],
  ai21: ["21", "AI21"],
  ibm: ["≡", "IBM"],
  groq: ["G", "GROQ"],
  together: ["T", "TOGETHER AI"],
  fireworks: ["✺", "FIREWORKS"],
  liquid: ["≈", "LIQUID AI"],
  nous: ["N", "NOUS"],
  openrouter: ["OR", "OPENROUTER"],
  anthropic: ["AI", "ANTHROPIC"],
  openai: ["◎", "OPENAI"],
  google: ["✦", "GOOGLE"],
  vibyra: ["V", "VIBYRA"]
};

export function renderProviderBrandLogo(info, color = true) {
  const [symbol, wordmark] = BRAND_MARKS[info.prompt]
    || BRAND_MARKS[info.provider]
    || [String(info.mark || "AI"), String(info.name || "AI").toUpperCase()];
  const face = `  ${symbol}  ${wordmark}  `;
  const top = `╭${"─".repeat(face.length)}╮`;
  const body = `│${face}│▓`;
  const bottom = `╰${"─".repeat(face.length)}╯▓`;
  const shadow = ` ${"▀".repeat(face.length + 2)}▓`;
  return [
    paint(top, info.color, color, true),
    paint(body, info.color, color, true),
    paint(bottom, info.color, color),
    color ? `${DIM}${shadow}${RESET}` : shadow
  ];
}

export function renderTerminalMarkdown(value, color = true) {
  const lines = String(value || "").trim().split(/\r?\n/);
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return color ? `${DIM}${"─".repeat(18)}${RESET}` : "------------------";
    }
    if (fenced) return color ? `${CODE}${line}${RESET}` : line;
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (heading) return color ? `${HEADING}${heading[2]}${RESET}` : heading[2];
    const bullet = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      const marker = bullet[2].endsWith(".") ? bullet[2] : "•";
      return `${bullet[1]}${color ? paint(marker, "38;2;139;92;255", true, true) : marker} ${renderInline(bullet[3], color)}`;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) return color ? `${DIM}│ ${renderInline(quote[1], true)}${RESET}` : `| ${quote[1]}`;
    return renderInline(line, color);
  }).join("\r\n");
}

export function formatElapsedDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function taskProgressText(modelName, elapsedMs) {
  return `${modelName} is still working · ${formatElapsedDuration(elapsedMs)}`;
}

export function taskCompletionText(elapsedMs) {
  return `Worked for ${formatElapsedDuration(elapsedMs)}`;
}

function renderInline(value, color) {
  if (!color) {
    return String(value)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }
  const links = [];
  let text = String(value).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    const token = `\u0000LINK${links.length}\u0000`;
    links.push(hyperlink(label, url));
    return token;
  });
  text = text
    .replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/`([^`]+)`/g, `${CODE}$1${RESET}`)
    .replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, (_, prefix, url) => `${prefix}${hyperlink(url, url)}`);
  return text.replace(/\u0000LINK(\d+)\u0000/g, (_, index) => links[Number(index)] || "");
}

function hyperlink(label, url) {
  return `\x1b]8;;${url}\x07${LINK}${UNDERLINE}${label}${RESET}\x1b]8;;\x07`;
}

function paint(value, code, enabled, bold = false) {
  if (!enabled) return value;
  return `\x1b[${bold ? "1;" : ""}${code}m${value}${RESET}`;
}
