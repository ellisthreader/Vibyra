#!/usr/bin/env node
// Generates this release's What's New hero art with the Codex CLI.
//
// Codex is a coding agent, not an image model: it cannot return a PNG. That is
// the right constraint here anyway — the art is authored as SVG, so it is a few
// kilobytes, stays sharp on every display, and arrives as reviewable source
// rather than an opaque binary in the repo.
//
//   node scripts/new-release-art.mjs --subject "what this release is about"
//        --version  defaults to tauri.conf.json
//        --force    overwrite art this version already has
//
// The style brief lives in release-art-brief.md so every release looks like it
// belongs to the same family. Edit that file to move the house style, not this
// one.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ART_DIR = join(DESKTOP, "public/releases");
/** Matches the hero band, and what the brief tells Codex to compose for. */
export const VIEWBOX = "0 0 740 232";
export const MAX_BYTES = 12_288;

function flag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : (process.argv[index + 1] ?? true);
}

/**
 * The checks that matter are the ones a reviewer cannot make by glancing at a
 * thumbnail: a stray <text> node, a remote reference that will not load
 * offline, or a viewBox that quietly letterboxes the band.
 */
export function problemsWith(svg) {
  const problems = [];
  if (!svg.trimStart().startsWith("<svg")) problems.push("not an SVG document");
  if (!svg.includes(`viewBox="${VIEWBOX}"`)) problems.push(`viewBox must be "${VIEWBOX}"`);
  if (/<text|<tspan/i.test(svg)) problems.push("contains text — the hero is decoration only");
  if (/<image\b/i.test(svg)) problems.push("embeds a raster image");
  if (/url\(\s*['"]?https?:/i.test(svg) || /href\s*=\s*['"]https?:/i.test(svg)) {
    problems.push("references something remote — it must work offline");
  }
  if (/<script/i.test(svg)) problems.push("contains script");
  if (Buffer.byteLength(svg) > MAX_BYTES) problems.push(`larger than ${MAX_BYTES} bytes`);
  return problems;
}

function version() {
  const given = flag("version");
  if (typeof given === "string" && given !== "") return given;
  return JSON.parse(readFileSync(join(DESKTOP, "src-tauri/tauri.conf.json"), "utf8")).version;
}

function brief(subject, output) {
  return readFileSync(join(DESKTOP, "scripts/release-art-brief.md"), "utf8")
    .replaceAll("{{SUBJECT}}", subject)
    .replaceAll("{{OUTPUT}}", output);
}

function main() {
  const subject = flag("subject");
  if (typeof subject !== "string" || subject.trim() === "") {
    throw new Error('Pass --subject "what this release is about".');
  }

  const target = join(ART_DIR, `${version()}.svg`);
  if (existsSync(target) && !process.argv.includes("--force")) {
    throw new Error(`${target} already exists. Pass --force to replace it.`);
  }
  mkdirSync(ART_DIR, { recursive: true });

  // Codex writes into its working directory, so it is pointed at the art folder
  // and the result is only moved into place once it passes.
  const scratch = `hero-${process.pid}.svg`;
  const result = spawnSync("codex", [
    "exec", "-s", "workspace-write", "--skip-git-repo-check", "-C", ART_DIR,
    brief(subject, scratch),
  ], { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) {
    throw new Error(`codex exec failed (exit ${result.status}). Is it installed and logged in?`);
  }

  const produced = join(ART_DIR, scratch);
  if (!existsSync(produced)) throw new Error(`Codex did not write ${scratch}.`);

  const svg = readFileSync(produced, "utf8");
  const problems = problemsWith(svg);
  if (problems.length > 0) {
    unlinkSync(produced);
    throw new Error(`The art Codex returned is unusable: ${problems.join("; ")}.`);
  }

  renameSync(produced, target);
  console.log(`${target} — ${Buffer.byteLength(svg)} bytes, checks passed`);
  console.log(`Set image: "/releases/${version()}.svg" on this version's changelog entry.`);
}

if (process.argv[1] && process.argv[1].endsWith("new-release-art.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(`\nnew-release-art: ${error.message}`);
    process.exit(1);
  }
}
