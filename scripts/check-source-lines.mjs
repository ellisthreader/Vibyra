import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CODE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".php",
  ".ts",
  ".tsx",
]);
const EXCLUDED_DIRECTORIES = [
  ".git",
  ".expo",
  ".vibyra-agent",
  "artifacts",
  "backend/bootstrap/cache",
  "backend/public/build",
  "backend/storage",
  "backend/vendor",
  "node_modules",
  "tmp",
];
const EXCLUDED_FILES = new Set([]);

function repoPath(path) {
  return relative(ROOT, path).split(sep).join("/");
}

function isExcluded(path) {
  const file = repoPath(path);
  if (EXCLUDED_FILES.has(file)) return true;
  return EXCLUDED_DIRECTORIES.some((directory) => (
    file === directory
    || file.startsWith(`${directory}/`)
    || file.includes(`/${directory}/`)
  ));
}

function physicalLines(source) {
  if (!source) return 0;
  const parts = source.split(/\r\n|\n|\r/);
  return parts.length - (parts.at(-1) === "" ? 1 : 0);
}

async function collect(path, files) {
  const absolute = resolve(ROOT, path);
  if (isExcluded(absolute)) return;
  const details = await stat(absolute);
  if (details.isDirectory()) {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      await collect(resolve(absolute, entry.name), files);
    }
    return;
  }
  if (!CODE_EXTENSIONS.has(extname(absolute).toLowerCase())) return;
  const canonical = await realpath(absolute);
  if (isExcluded(canonical)) return;
  const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  files.set(key, canonical);
}

async function loadScope(path) {
  const manifest = JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  if (!Array.isArray(manifest.paths) || manifest.paths.length === 0) {
    throw new Error(`Scope manifest ${path} must contain a non-empty paths array.`);
  }
  return manifest;
}

function parseArguments(argv) {
  const options = { hierarchy: false, limit: 200, scope: "", summary: false, top: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--hierarchy") options.hierarchy = true;
    else if (argument === "--summary") options.summary = true;
    else if (argument === "--scope") options.scope = argv[++index] || "";
    else if (argument === "--limit") options.limit = Number(argv[++index]);
    else if (argument === "--top") options.top = Number(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isInteger(options.top) || options.top < 0) {
    throw new Error("--top must be a non-negative integer.");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-source-lines.mjs --scope <manifest.json> [--limit 200]
  node scripts/check-source-lines.mjs --hierarchy [--scope <manifest.json>] [--top 50]
  node scripts/check-source-lines.mjs --summary --scope <manifest.json> [--limit 200]

Scoped mode exits non-zero when a selected first-party code file exceeds the limit.
Hierarchy mode reports largest files first and does not enforce the limit.
Summary mode prints a Markdown code-length table and does not enforce the limit.`);
}

function areaFor(file) {
  const parts = file.split("/");
  if (parts[0] !== "src") return file;
  if (parts[1] === "screens" && parts[2] === "workspace" && parts.length > 4) {
    return parts.slice(0, 4).join("/");
  }
  if (parts[1] === "screens" && parts.length > 3) return parts.slice(0, 3).join("/");
  return parts.slice(0, 2).join("/");
}

function printSummary(rows, limit) {
  const groups = new Map();
  for (const row of rows) {
    const area = areaFor(row.file);
    const group = groups.get(area) || { area, files: 0, lines: 0, largest: row, over: 0 };
    group.files += 1;
    group.lines += row.lines;
    if (row.lines > group.largest.lines) group.largest = row;
    if (row.lines > limit) group.over += 1;
    groups.set(area, group);
  }
  console.log("| Area | Files | Lines | Average | Largest file | Over limit |");
  console.log("|---|---:|---:|---:|---|---:|");
  for (const group of groups.values()) {
    const largest = `${group.largest.file} (${group.largest.lines})`;
    console.log(`| ${group.area} | ${group.files} | ${group.lines} | ${Math.round(group.lines / group.files)} | ${largest} | ${group.over} |`);
  }
  const totalLines = rows.reduce((sum, row) => sum + row.lines, 0);
  const testRows = rows.filter((row) => /(?:\.test\.|testSupport)/.test(row.file));
  const testLines = testRows.reduce((sum, row) => sum + row.lines, 0);
  console.log(`\nTotal: ${rows.length} files, ${totalLines} lines, ${rows.filter((row) => row.lines > limit).length} over ${limit}.`);
  console.log(`Application: ${rows.length - testRows.length} files, ${totalLines - testLines} lines. Tests/support: ${testRows.length} files, ${testLines} lines.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.hierarchy && !options.summary && !options.scope) {
    throw new Error("Use --scope for a line gate, --hierarchy, or --summary for a report.");
  }

  const manifest = options.scope ? await loadScope(options.scope) : null;
  const files = new Map();
  for (const path of manifest?.paths || ["."]) await collect(path, files);
  const rows = await Promise.all([...files.values()].map(async (path) => ({
    file: repoPath(path),
    lines: physicalLines(await readFile(path, "utf8")),
  })));
  rows.sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));

  if (options.summary) {
    printSummary(rows, options.limit);
    return;
  }

  if (options.hierarchy) {
    const selected = options.top === 0 ? rows : rows.slice(0, options.top);
    for (const row of selected) console.log(`${row.lines}\t${row.file}`);
    console.log(`\nFirst-party code files ranked: ${rows.length}`);
    return;
  }

  const oversized = rows.filter((row) => row.lines > options.limit);
  for (const row of oversized) console.log(`${row.lines}\t${row.file}`);
  console.log(`\nScope: ${manifest.name || options.scope}`);
  console.log(`First-party code files checked: ${rows.length}`);
  console.log(`Files over ${options.limit} lines: ${oversized.length}`);
  process.exitCode = oversized.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
