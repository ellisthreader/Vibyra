import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const defaultRoot = path.resolve(moduleDir, "../../..");

export function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

export function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

export function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}
