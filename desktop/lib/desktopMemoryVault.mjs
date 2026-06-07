import { requestDesktopProjectMemory } from "./desktopProjectMemory.mjs";

const MAX_ID_LENGTH = 26;
const MAX_NAME_LENGTH = 255;
const MAX_MARKDOWN_BYTES = 512_000;
const MAX_IMPORT_FILES = 500;
const MAX_IMPORT_DEPTH = 32;
const MAX_IMPORT_BYTES = 10_000_000;
const COLLISION_POLICIES = new Set(["skip", "replace", "keep_both"]);

export async function getDesktopMemoryVault(projectId, fetchImpl = fetch) {
  return requestDesktopProjectMemory(projectId, "/vault", {}, fetchImpl);
}

export async function createDesktopMemoryNode(projectId, input, fetchImpl = fetch) {
  return requestDesktopProjectMemory(projectId, "/nodes", jsonRequest("POST", normalizeCreateNode(input)), fetchImpl);
}

export async function updateDesktopMemoryNode(projectId, nodeId, input, fetchImpl = fetch) {
  const id = requiredId(nodeId, "Memory node");
  return requestDesktopProjectMemory(projectId, `/nodes/${encodeURIComponent(id)}`, jsonRequest("PATCH", normalizeUpdateNode(input)), fetchImpl);
}

export async function deleteDesktopMemoryNode(projectId, nodeId, input = {}, fetchImpl = fetch) {
  const id = requiredId(nodeId, "Memory node");
  const body = normalizeDeleteNode(input);
  return requestDesktopProjectMemory(projectId, `/nodes/${encodeURIComponent(id)}`, jsonRequest("DELETE", body), fetchImpl);
}

export async function importDesktopMemoryManifest(projectId, input, fetchImpl = fetch) {
  return requestDesktopProjectMemory(projectId, "/imports", jsonRequest("POST", normalizeImport(input)), fetchImpl);
}

export function normalizeMemoryImportManifest(input) {
  return normalizeImport(input);
}

function normalizeCreateNode(input) {
  const value = objectInput(input);
  const type = String(value.type || "").trim().toLowerCase();
  if (type !== "folder" && type !== "document") throw validationError("Memory node type must be folder or document.");
  const node = {
    type,
    name: requiredName(value.name),
    parentId: optionalId(value.parentId, "Parent node")
  };
  if (type === "document") node.markdown = markdown(value.markdown ?? value.markdownContent);
  return node;
}

function normalizeUpdateNode(input) {
  const value = objectInput(input);
  const node = { version: integerValue(value.version, "version", 1) };
  if (value.name !== undefined) node.name = requiredName(value.name);
  if (value.parentId !== undefined) node.parentId = optionalId(value.parentId, "Parent node");
  if (value.markdown !== undefined || value.markdownContent !== undefined) {
    node.markdown = markdown(value.markdown ?? value.markdownContent);
  }
  if (Object.keys(node).length === 1) throw validationError("Provide at least one memory node change.");
  return node;
}

function normalizeDeleteNode(input) {
  const value = objectInput(input);
  const body = {};
  if (value.version !== undefined) body.version = integerValue(value.version, "version", 1);
  if (value.recursive !== undefined) body.recursive = booleanValue(value.recursive, "recursive");
  return body;
}

function normalizeImport(input) {
  const value = objectInput(input);
  rejectFilesystemFields(value);
  if (!Array.isArray(value.files) || value.files.length === 0) throw validationError("Select at least one Markdown file to import.");
  if (value.files.length > MAX_IMPORT_FILES) throw validationError(`Memory imports are limited to ${MAX_IMPORT_FILES} files.`);
  const collisionStrategy = String(value.collisionStrategy || value.collisionPolicy || "skip").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!COLLISION_POLICIES.has(collisionStrategy)) throw validationError("collisionStrategy must be skip, replace, or keep_both.");

  let totalBytes = 0;
  const seen = new Set();
  const files = value.files.map((file, index) => {
    const item = objectInput(file, `Import file ${index + 1}`);
    rejectFilesystemFields(item);
    const path = normalizedMarkdownPath(item.path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw validationError(`Duplicate Markdown import path: ${path}`);
    seen.add(key);
    const content = markdown(item.markdown ?? item.content, `Import file ${path}`);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > MAX_IMPORT_BYTES) throw validationError("Memory import content exceeds 10 MB.");
    const source = item.source === "obsidian_import" ? "obsidian_import" : "markdown_import";
    return { path, markdown: content, source };
  });
  return { files, collisionStrategy };
}

function normalizedMarkdownPath(input) {
  const raw = String(input || "").trim();
  if (!raw || raw.includes("\0") || raw.startsWith("/") || raw.startsWith("\\") || /^[a-z]:[\\/]/i.test(raw) || /^[a-z]+:\/\//i.test(raw)) {
    throw validationError("Markdown import paths must be relative vault paths.");
  }
  const segments = raw.replace(/\\/g, "/").split("/");
  if (segments.length > MAX_IMPORT_DEPTH) throw validationError(`Markdown import paths are limited to ${MAX_IMPORT_DEPTH} levels.`);
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) {
    throw validationError("Markdown import paths cannot contain traversal or hidden folders.");
  }
  const path = segments.join("/");
  if (!path.toLowerCase().endsWith(".md")) throw validationError("Memory imports only accept Markdown (.md) files.");
  if (path.length > 1_024) throw validationError("Markdown import paths are too long.");
  return path;
}

function rejectFilesystemFields(value) {
  for (const key of ["absolutePath", "localPath", "rootPath", "sourcePath", "vaultPath", "directory"]) {
    if (value[key] !== undefined) throw validationError("Memory imports cannot include local filesystem paths.");
  }
}

function markdown(value, label = "Markdown content") {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw validationError(`${label} must be text.`);
  if (Buffer.byteLength(value, "utf8") > MAX_MARKDOWN_BYTES) throw validationError(`${label} exceeds 500 KB.`);
  return value;
}

function requiredName(value) {
  const name = String(value || "").trim();
  if (!name) throw validationError("Memory node name is required.");
  if (name.length > MAX_NAME_LENGTH || /[\/\\\0]/.test(name) || name === "." || name === "..") {
    throw validationError("Memory node name is invalid.");
  }
  return name;
}

function requiredId(value, label) {
  const id = String(value || "").trim();
  if (!id || id.length > MAX_ID_LENGTH) throw validationError(`${label} id is invalid.`);
  return id;
}

function optionalId(value, label) {
  return value === null || value === "" || value === undefined ? null : requiredId(value, label);
}

function integerValue(value, label, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) throw validationError(`${label} must be an integer of at least ${minimum}.`);
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== "boolean") throw validationError(`${label} must be true or false.`);
  return value;
}

function objectInput(value, label = "Memory request") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError(`${label} must be an object.`);
  return value;
}

function jsonRequest(method, body) {
  return { method, body: JSON.stringify(body) };
}

function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}
