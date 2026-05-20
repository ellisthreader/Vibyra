import type { GeneratedApp } from "../../../types/domain";
import { reactPreviewHtml } from "./chatPreviewReactHtml";

type CodeBlock = {
  code: string;
  filename: string;
  language: string;
};

export function previewAppFromMessage(messageId: string, text: string): GeneratedApp | null {
  if (text.includes("▍")) return null;
  const blocks = parseCodeBlocks(text);
  if (blocks.length === 0) return null;

  const html = findBlock(blocks, ["html", "htm"], ["index.html"]);
  if (html?.code.trim()) {
    return {
      id: `${messageId}-preview-fallback`,
      source: "generated",
      title: previewTitle(html.filename),
      html: previewHtmlFromBlocks(html, blocks)
    };
  }

  const appCode = findReactAppBlock(blocks);
  if (!appCode) return null;
  const css = findBlock(blocks, ["css"], ["app.css", "style.css", "styles.css"]);

  return {
    id: `${messageId}-preview-fallback`,
    source: "generated",
    title: previewTitle(appCode.filename),
    html: reactPreviewHtml(appCode.code, css?.code ?? "")
  };
}

function parseCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const info = parseFenceInfo(match[1] ?? "");
    blocks.push({ ...info, code: (match[2] ?? "").replace(/\n$/, "") });
  }
  return blocks;
}

function parseFenceInfo(info: string): Pick<CodeBlock, "filename" | "language"> {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  let language = "";
  let filename = "";
  for (const token of tokens) {
    if (!filename && /\.[a-z0-9]+$/i.test(token)) filename = token;
    else if (!language) language = token;
  }
  if (!language && filename) language = filename.split(".").pop() ?? "";
  return { filename, language: language.toLowerCase() };
}

function findBlock(blocks: CodeBlock[], languages: string[], filenames: string[]) {
  return blocks.find((block) => {
    const filename = block.filename.toLowerCase().split("/").pop() ?? "";
    return languages.includes(block.language) || filenames.includes(filename);
  });
}

function findReactAppBlock(blocks: CodeBlock[]) {
  return blocks.find((block) => {
    const filename = block.filename.toLowerCase().split("/").pop() ?? "";
    const language = block.language.toLowerCase();
    const looksLikeAppFile = /^(app|main|index)\.(jsx?|tsx?)$/.test(filename);
    const looksLikeJsx = ["jsx", "tsx"].includes(language);
    return (looksLikeAppFile || looksLikeJsx) && /<[A-Za-z][\s\S]*>/.test(block.code);
  });
}

function findBlockByLocalPath(blocks: CodeBlock[], path: string) {
  const target = normalizeLocalPath(path);
  if (!target) return undefined;
  return blocks.find((block) => {
    const filename = normalizeLocalPath(block.filename);
    return filename === target || filename.endsWith(`/${target}`) || filename.split("/").pop() === target.split("/").pop();
  });
}

function previewHtmlFromBlocks(html: CodeBlock, blocks: CodeBlock[]) {
  const entry = firstLocalScript(html.code);
  const entryBlock = entry ? findBlockByLocalPath(blocks, entry) : undefined;
  const css = collectCss(blocks);
  if (entryBlock?.code.trim()) {
    const code = bundleScriptBlocks(blocks, entryBlock, html);
    if (isReactPreviewCode(code, entryBlock)) return reactPreviewHtml(code, css);
    return ensureHtmlDocument(inlineHtmlResources(html.code, blocks).replace(localScriptTagRe(entry), `<script>${escapeScript(stripModuleSyntax(entryBlock.code))}</script>`));
  }
  return ensureHtmlDocument(inlineHtmlResources(html.code, blocks));
}

function inlineHtmlResources(html: string, blocks: CodeBlock[]) {
  return html.replace(/<link\b([^>]*?)\bhref\s*=\s*(["'])(?!https?:|data:|\/\/|about:|#)([^"']+)\2([^>]*)>/gi, (match, before, _quote, href, after) => {
    const rel = `${before} ${after}`.match(/\brel\s*=\s*(["']?)([^"'\s>]+)/i)?.[2]?.toLowerCase() ?? "";
    if (rel && !/(?:stylesheet|preload|modulepreload)/i.test(rel)) return match;
    const block = findBlockByLocalPath(blocks, href);
    return block?.code.trim() ? `<style>${escapeStyle(block.code)}</style>` : "";
  });
}

function firstLocalScript(html: string) {
  const match = /<script\b[^>]*\bsrc\s*=\s*(["'])(?!https?:|data:|blob:|\/\/|about:)([^"']+)\1[^>]*>\s*<\/script>/i.exec(html);
  return match?.[2] ?? "";
}

function localScriptTagRe(path: string) {
  return new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*(["'])${escapeRegExp(path)}\\1[^>]*>\\s*<\\/script>`, "i");
}

function bundleScriptBlocks(blocks: CodeBlock[], entry: CodeBlock, html: CodeBlock) {
  const entryPath = normalizeLocalPath(entry.filename);
  const htmlPath = normalizeLocalPath(html.filename);
  const scriptBlocks = blocks.filter((block) => {
    const path = normalizeLocalPath(block.filename);
    if (!block.code.trim() || path === htmlPath || isCssBlock(block)) return false;
    return isScriptBlock(block);
  });
  const ordered = [
    ...scriptBlocks.filter((block) => normalizeLocalPath(block.filename) !== entryPath),
    entry
  ];
  return ordered.map((block) => block.code).join("\n\n");
}

function collectCss(blocks: CodeBlock[]) {
  return blocks.filter(isCssBlock).map((block) => block.code).join("\n\n");
}

function isCssBlock(block: CodeBlock) {
  const filename = block.filename.toLowerCase();
  return block.language === "css" || /\.(css|scss|sass|less)$/.test(filename);
}

function isScriptBlock(block: CodeBlock) {
  const filename = block.filename.toLowerCase();
  return ["js", "jsx", "ts", "tsx", "javascript", "typescript"].includes(block.language)
    || /\.(jsx?|tsx?)$/.test(filename);
}

function isReactPreviewCode(code: string, entry: CodeBlock) {
  return /<[A-Za-z][\s\S]*>/.test(code)
    || /\.(jsx|tsx)$/i.test(entry.filename)
    || /\bReactDOM\b|\bcreateRoot\b|\bfrom\s+["']react["']/.test(code);
}

function normalizeLocalPath(path: string) {
  return path.trim().replace(/^[./]+/, "").replace(/\\/g, "/").replace(/^src\//, "src/").split(/[?#]/)[0].toLowerCase();
}

function previewTitle(filename: string) {
  if (!filename) return "Generated preview";
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  return base.replace(/\.[a-z0-9]+$/i, "") || "Generated preview";
}

function ensureHtmlDocument(html: string) {
  const trimmed = html.trim();
  if (/<!doctype html|<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${trimmed}</body></html>`;
}

function stripModuleSyntax(code: string) {
  return code
    .replace(/^\s*import\s+type\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*(?:const|let|var)\s+[^=\n]+=\s*require\(["'][^"']+["']\);?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
    .replace(/^\s*export\s+(?=(?:const|let|var|function|class)\s+)/gm, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeScript(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(value: string) {
  return value.replace(/<\/style/gi, "<\\/style");
}
