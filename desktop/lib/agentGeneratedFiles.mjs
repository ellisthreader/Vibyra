import { isAbsolute, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";

const MAX_GENERATED_FILES = 12;
const MAX_FILE_BYTES = 220_000;

export function extractGeneratedFiles(responseText) {
  const fenced = responseText.match(/```json\s*([\s\S]*?)```/i)?.[1];
  return filesFromJson(fenced ?? responseText);
}

export async function normalizeGeneratedFiles(project, files) {
  const normalized = [];
  for (const file of files.slice(0, MAX_GENERATED_FILES)) {
    const path = safeRelativePath(file?.path);
    const content = typeof file?.content === "string" ? file.content : "";
    if (!path || !content || Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) continue;
    const fullPath = await safeProjectPath(project, path, { mustExist: false });
    const previousBody = await readOptionalText(fullPath);
    normalized.push({ path, content: content.endsWith("\n") ? content : `${content}\n`, previousBody });
  }
  return normalized;
}

export async function safeProjectPath(project, relativePath, { mustExist }) {
  const root = resolve(project.path);
  const safePath = safeRelativePath(relativePath);
  if (!safePath) throw new Error("Generated file path must stay inside the selected project.");
  const fullPath = resolve(root, safePath);
  const fromRoot = relative(root, fullPath);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("Generated file path must stay inside the selected project.");
  }
  if (mustExist) await stat(fullPath);
  return fullPath;
}

export async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function filesFromJson(payload) {
  const text = String(payload ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const decoded = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(decoded.files) ? decoded.files : [];
  } catch {
    return [];
  }
}

function safeRelativePath(path) {
  const value = String(path ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || isAbsolute(value)) return null;
  const segments = value.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return null;
  if (segments.some((segment) => [".git", ".expo", ".vibyra-agent", "node_modules", "vendor"].includes(segment))) return null;
  return segments.join("/");
}
