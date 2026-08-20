import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const stylesDir = new URL("src/styles/", root);
const entryPath = new URL("src/main.tsx", root);
const targetLines = 180;

function lineCount(source) {
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

function topLevelUnits(source) {
  const units = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    if (depth === 0 && (character === "}" || character === ";")) {
      units.push(source.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (source.slice(start).trim()) units.push(source.slice(start));
  return units;
}

function chunks(source) {
  const result = [];
  let current = "";
  for (const unit of topLevelUnits(source)) {
    if (lineCount(unit) > targetLines) {
      throw new Error(`A top-level CSS block exceeds ${targetLines} lines`);
    }
    if (current && lineCount(current + unit) > targetLines) {
      result.push(`${current.trim()}\n`);
      current = "";
    }
    current += unit;
  }
  if (current.trim()) result.push(`${current.trim()}\n`);
  return result;
}

let entry = await readFile(entryPath, "utf8");
const files = (await readdir(stylesDir))
  .filter((file) => file.endsWith(".css") && !file.includes(".part-"))
  .sort();

for (const file of files) {
  const path = new URL(file, stylesDir);
  const source = await readFile(path, "utf8");
  if (lineCount(source) <= 200) continue;
  const parts = chunks(source);
  await writeFile(path, parts[0], "utf8");
  const imports = [];
  for (let index = 1; index < parts.length; index += 1) {
    const part = file.replace(/\.css$/, `.part-${String(index + 1).padStart(2, "0")}.css`);
    await writeFile(new URL(part, stylesDir), parts[index], "utf8");
    imports.push(`import "./styles/${part}";`);
  }
  const original = `import "./styles/${file}";`;
  entry = entry.replace(original, [original, ...imports].join("\n"));
  console.log(`${file}: ${parts.map(lineCount).join(", ")}`);
}

await writeFile(entryPath, entry, "utf8");
