import { FileEntry } from "../types/domain";
import { isRunArtifact } from "../utils/files";

export type ProjectFileContext = {
  path: string;
  language: string;
  loaded: boolean;
  snippet?: string;
};
export type ProjectContextFetcher = (prompt: string) => Promise<ProjectFileContext[]>;

export function shouldAttachFileContext(prompt: string, file: FileEntry | null): boolean {
  if (!file) return false;
  const text = prompt.trim().toLowerCase();
  const name = file.path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const path = file.path.toLowerCase();
  if (/\b(this|current|selected|open)\s+(file|code|component|class|function)\b/.test(text)) return true;
  if (/\b(in|inside|from|within)\s+(this|the|my)?\s*(file|selected file|current file)\b/.test(text)) return true;
  if (name && text.includes(name) && /\b(file|code|explain|fix|change|update|refactor|review)\b/.test(text)) return true;
  return path.length > 4 && text.includes(path);
}

export async function projectFileContext(
  files: FileEntry[],
  prompt: string,
  readFile?: (path: string) => Promise<FileEntry | null>,
  fetchProjectContext?: ProjectContextFetcher
): Promise<ProjectFileContext[]> {
  const retrieved = await readOptionalProjectContext(prompt, fetchProjectContext);
  if (retrieved.length > 0) return retrieved;

  const base = files
    .filter((file) => file.id !== "empty" && file.path && !isRunArtifact(file))
    .slice(0, 300)
    .map((file) => ({
      path: file.path,
      language: file.language || "",
      loaded: Boolean(file.body?.trim())
    }));
  if (!wantsStyleContext(prompt)) return base;

  const byPath = new Map(files.map((file) => [file.path, file]));
  const stylePaths = base
    .filter((item) => isStyleContextPath(item.path, item.language))
    .slice(0, 8)
    .map((item) => item.path);
  const snippets: Record<string, string> = {};

  for (const path of stylePaths) {
    const local = byPath.get(path);
    const file = local?.body?.trim() ? local : await readOptionalFile(path, readFile);
    const snippet = file?.body ? styleExcerpt(file.body) : "";
    if (snippet) snippets[path] = snippet;
  }

  return base.map((item) => snippets[item.path] ? { ...item, snippet: snippets[item.path] } : item);
}

async function readOptionalProjectContext(prompt: string, fetchProjectContext?: ProjectContextFetcher) {
  try {
    const files = await fetchProjectContext?.(prompt);
    return Array.isArray(files) ? files.filter((file) => file.path).slice(0, 300) : [];
  } catch {
    return [];
  }
}

async function readOptionalFile(path: string, readFile?: (path: string) => Promise<FileEntry | null>) {
  try {
    return await readFile?.(path);
  } catch {
    return null;
  }
}

function wantsStyleContext(prompt: string) {
  return /\b(colou?r|palette|scheme|theme|brand|branding|visual identity|styling|design system)\b/i.test(prompt);
}

function isStyleContextPath(path: string, language: string) {
  const value = `${path} ${language}`.toLowerCase();
  return /\.(css|scss|sass|less|tsx?|jsx?)$/.test(path.toLowerCase())
    && /\b(style|styles|theme|themes|color|colors|colour|colours|palette|token|tokens|tailwind|component|screen|page|app)\b/.test(value);
}

function styleExcerpt(body: string) {
  const lines = body.split(/\r\n|\r|\n/);
  const matches = lines
    .map((line, index) => ({ index: index + 1, line: line.trim() }))
    .filter(({ line }) => /#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|\b(color|background|border|shadow|theme|palette|primary|secondary|accent|surface|text|muted|brand)\b|var\(/i.test(line))
    .slice(0, 24)
    .map(({ index, line }) => `${index}: ${line}`);
  const text = matches.length > 0 ? matches.join("\n") : lines.slice(0, 20).join("\n");
  return text.slice(0, 1200);
}
