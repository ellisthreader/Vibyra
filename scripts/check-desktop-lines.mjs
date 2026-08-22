import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESKTOP_ROOTS = [join(ROOT, "desktop-tauri")];
const LIMIT = Number(process.env.VIBYRA_DESKTOP_LINE_LIMIT || 200);
const CODE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".php",
  ".rs",
  ".ts",
  ".tsx",
]);
const EXCLUDED_PATHS = new Set([
  "desktop-tauri/src/assets/providerLogos.js",
]);
const EXCLUDED_DIRECTORIES = new Set(["dist", "node_modules", "target"]);

async function collectCodeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      files.push(...await collectCodeFiles(path));
    } else if (CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
  return files;
}

function repoPath(path) {
  return relative(ROOT, path).split(sep).join("/");
}

function lineCount(source) {
  if (!source) return 0;
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

function priority(lines) {
  if (lines > 1000) return "VH-1";
  if (lines > 500) return "VH-2";
  if (lines > 300) return "VH-3";
  return "VH-4";
}

const files = (await Promise.all(DESKTOP_ROOTS.map(collectCodeFiles))).flat();
const rows = await Promise.all(files.map(async (path) => {
  const file = repoPath(path);
  return {
    excluded: EXCLUDED_PATHS.has(file),
    file,
    lines: lineCount(await readFile(path, "utf8")),
  };
}));

const oversized = rows
  .filter((row) => !row.excluded && row.lines > LIMIT)
  .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
const excludedOversized = rows
  .filter((row) => row.excluded && row.lines > LIMIT)
  .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));

for (const row of oversized) {
  console.log(`${priority(row.lines)}\t${row.lines}\t${row.file}`);
}
if (excludedOversized.length) {
  console.log("\nGenerated/vendor exclusions:");
  for (const row of excludedOversized) console.log(`EXCLUDED\t${row.lines}\t${row.file}`);
}
console.log(`\nTauri desktop first-party files over ${LIMIT} lines: ${oversized.length}`);
process.exitCode = oversized.length ? 1 : 0;
