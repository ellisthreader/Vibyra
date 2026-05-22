import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { contentTypeFor, previewEntryPath, previewMountDirectory } from "./previewStatic.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { referencesFromFile } from "./publishDemoBundleRefs.mjs";

const DEFAULT_LIMITS = { maxFiles: 180, maxTotalBytes: 8_000_000, maxFileBytes: 2_000_000 };
const STATIC_DIRS = ["assets", "static", "images", "img", "media", "fonts", "models", "audio", "video", "sounds", "textures", "icons"];
const UNSAFE_DIRS = new Set([".git", ".hg", ".svn", ".expo", ".vibyra-agent", "node_modules", "vendor", "private", "secrets", "credentials", ".ssh", ".cache", ".parcel-cache"]);
const UNSAFE_NAMES = [/^\.env(?:\.|$)/i, /(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i, /^id_rsa/i];
const UNSAFE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".crt", ".cer"]);
const RUNTIME_EXTENSIONS = new Set([
  ".avif", ".bmp", ".css", ".gif", ".glb", ".gltf", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".m4v", ".mjs", ".mov", ".mp3", ".mp4", ".ogg", ".otf", ".png", ".svg", ".ttf", ".txt", ".wasm",
  ".webm", ".webmanifest", ".webp", ".woff", ".woff2"
]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".cjs", ".svg", ".txt", ".webmanifest", ".gltf"]);

export async function buildProjectPublishDemoBundle(projectId, options = {}) {
  const project = await requireProject(projectId);
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const entryPath = await previewEntryPath(project);
  const metadata = { limits, projectId: project.id, projectPath: project.path, skipped: [], warnings: [] };
  if (!entryPath) return failure("no_static_preview_entry", "No built static browser entry was found for this project.", metadata);

  const state = { project, limits, files: [], seen: new Set(), queue: [], totalBytes: 0, failed: null, metadata };
  const mountDirectory = previewMountDirectory(entryPath);
  metadata.entryPath = entryPath;
  metadata.mountDirectory = mountDirectory;

  await addBundleFile(state, entryPath, { required: true, mountDirectory });
  while (state.queue.length && !state.failed) {
    const item = state.queue.shift();
    await addBundleFile(state, item.path, { required: true, mountDirectory, from: item.from });
  }
  if (!state.failed) await addOptionalStaticAssets(state, mountDirectory);
  if (state.failed) return failure(state.failed.code, state.failed.reason, metadata);

  metadata.totalFiles = state.files.length;
  metadata.totalBytes = state.totalBytes;
  metadata.truncated = metadata.skipped.some((item) => item.reason === "bundle_limit_reached");
  return { ok: true, kind: "static-demo-bundle", projectId: project.id, entryPath, mountDirectory, files: state.files, metadata };
}

async function requireProject(projectId) {
  if (!projectId) throw new Error("No project selected");
  if (projectById(projectId)) return projectById(projectId);
  await discoverProjects();
  const project = projectById(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

async function addBundleFile(state, path, { required, mountDirectory, from = "" }) {
  const safe = safeRelativePath(path);
  if (!safe || state.seen.has(safe)) return;
  const unsafeReason = unsafeBundlePathReason(safe);
  if (unsafeReason) return skipOrFail(state, safe, unsafeReason, required, from);
  if (!RUNTIME_EXTENSIONS.has(extname(safe).toLowerCase())) return skipOrFail(state, safe, "unsupported_runtime_type", required, from);

  const absolutePath = resolve(state.project.path, safe);
  if (!pathStaysInside(state.project.path, absolutePath)) return skipOrFail(state, safe, "outside_project", required, from);
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    return skipOrFail(state, safe, "missing_reference", false, from);
  }
  if (!info.isFile()) return skipOrFail(state, safe, "not_a_file", required, from);
  if (info.size > state.limits.maxFileBytes) return skipOrFail(state, safe, "file_too_large", required, from);
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + info.size > state.limits.maxTotalBytes) {
    return skipOrFail(state, safe, "bundle_limit_reached", required, from);
  }

  const buffer = await readFile(absolutePath);
  const encoding = isTextFile(safe) ? "utf8" : "base64";
  state.seen.add(safe);
  state.totalBytes += info.size;
  state.files.push({
    path: safe,
    contentType: contentTypeFor(safe),
    size: info.size,
    encoding,
    body: encoding === "utf8" ? buffer.toString("utf8") : buffer.toString("base64")
  });

  if (encoding === "utf8") {
    for (const ref of referencesFromFile(safe, buffer.toString("utf8"), mountDirectory)) {
      if (!state.seen.has(ref)) state.queue.push({ path: ref, from: safe });
    }
  }
}

async function addOptionalStaticAssets(state, mountDirectory) {
  for (const directory of STATIC_DIRS.map((name) => (mountDirectory ? `${mountDirectory}/${name}` : name))) {
    await scanOptionalDirectory(state, directory, mountDirectory, 0);
    if (state.files.length >= state.limits.maxFiles || state.totalBytes >= state.limits.maxTotalBytes) break;
  }
}

async function scanOptionalDirectory(state, directory, mountDirectory, depth) {
  if (depth > 6 || state.files.length >= state.limits.maxFiles) return;
  let entries;
  try {
    entries = await readdir(resolve(state.project.path, directory), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!unsafeBundlePathReason(child)) await scanOptionalDirectory(state, child, mountDirectory, depth + 1);
    } else if (entry.isFile()) {
      await addBundleFile(state, child, { required: false, mountDirectory });
    }
    if (state.files.length >= state.limits.maxFiles || state.totalBytes >= state.limits.maxTotalBytes) return;
  }
}

function skipOrFail(state, path, reason, required, from) {
  state.metadata.skipped.push({ path, reason, ...(from ? { from } : {}) });
  if (required && ["file_too_large", "bundle_limit_reached", "outside_project", "unsupported_runtime_type"].includes(reason)) {
    state.failed = { code: "bundle_limit_exceeded", reason: `Static demo bundle could not include ${path}: ${reason.replace(/_/g, " ")}.` };
  }
}

function failure(code, reason, metadata) {
  return { ok: false, code, reason, failureReasons: [reason], files: [], metadata };
}

function safeRelativePath(path) {
  const normalized = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.includes("\0")) return "";
  return normalized.split("/").filter(Boolean).join("/");
}

function unsafeBundlePathReason(path) {
  const segments = path.split("/");
  if (segments.some((segment) => UNSAFE_DIRS.has(segment))) return "unsafe_or_private_directory";
  if (segments.some((segment) => UNSAFE_NAMES.some((pattern) => pattern.test(segment)))) return "env_or_credential_file";
  if (UNSAFE_EXTENSIONS.has(extname(basename(path)).toLowerCase())) return "credential_or_private_file";
  return "";
}

function pathStaysInside(root, filePath) {
  const relativePath = relative(resolve(root), resolve(filePath));
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}
