#!/usr/bin/env node
// Publishes a built Mac release to the in-app update feed.
//
// This replaces the copy-and-paste ritual the release workflow used to end in:
// read six values per architecture out of a job summary, upload two archives by
// hand, set twelve Railway variables, redeploy, hope. Every one of those steps
// fails silently — a wrong hash, a stale path or a missing .sig produces a feed
// that answers 204 forever, and the only symptom is that nobody's Mac updates.
//
//   node scripts/publish-macos-update.mjs --dir ~/Downloads/vibyra-release
//        --dir      where the .app.tar.gz + .sig artifacts were downloaded to
//        --notes    one line shown in the update banner
//        --apply    actually upload, set variables and redeploy
//
// Without --apply nothing leaves this machine: it verifies the artifacts, shows
// the exact plan, and stops. Run it that way first.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { verifyUpdateSignature } from "./minisign-verify.mjs";
import {
  ARTIFACT_SUFFIX,
  MAC_TARGETS,
  feedPath,
  remotePath,
  variablesFor,
} from "./macos-update-plan.mjs";

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = ["--service", "Vibyra", "--environment", "production"];
const VOLUME = "/app/storage/app/private";

function flag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : (process.argv[index + 1] ?? true);
}

const APPLY = process.argv.includes("--apply");

function config() {
  return JSON.parse(readFileSync(join(DESKTOP, "src-tauri/tauri.conf.json"), "utf8"));
}

function baseUrl() {
  return new URL(config().plugins.updater.endpoints[0]).origin;
}

/** Finds `Vibyra-Desktop-<version>-macos-<arch>.app.tar.gz` and its `.sig`,
 * wherever the CI artifact download unpacked them. */
function find(directory, arch) {
  const wanted = `macos-${arch}${ARTIFACT_SUFFIX}`;
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(wanted) ? [path] : [];
  });
  const matches = walk(directory);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one *${wanted} under ${directory}, found ${matches.length}.`);
  }
  return matches[0];
}

/** Reads one architecture's artifact and proves it is installable. */
function inspect(target, directory, version, revision, notes, publishedAt) {
  const archive = find(directory, target.arch);
  const contents = readFileSync(archive);
  const signature = readFileSync(`${archive}.sig`, "utf8").trim();

  // The check an installed client performs, run here instead — where a failure
  // costs a re-run rather than stranding every Mac behind a bad download.
  verifyUpdateSignature(contents, signature, config().plugins.updater.pubkey);

  const filename = archive.split("/").pop();
  const entry = {
    archive,
    version,
    filename,
    path: remotePath(version, revision, target.arch, filename),
    size: statSync(archive).size,
    sha256: createHash("sha256").update(contents).digest("hex"),
    signature,
    notes,
    publishedAt,
  };
  return { target, entry, variables: variablesFor(target, entry) };
}

function railway(args, options = {}) {
  const result = spawnSync("npx", ["--yes", "@railway/cli", ...args], {
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input: options.input,
    maxBuffer: 1 << 30,
  });
  if (result.status !== 0) {
    throw new Error(`railway ${args[0]} failed (exit ${result.status}).`);
  }
}

function capture(args, input) {
  const result = spawnSync("npx", ["--yes", "@railway/cli", ...args], {
    encoding: "utf8",
    input,
    maxBuffer: 1 << 30,
  });
  if (result.status !== 0) throw new Error(result.stderr || `railway ${args[0]} failed.`);
  return result.stdout;
}

/** Streams the archive onto the volume, then re-hashes it there. A partial
 * upload that still matched the configured size and hash is the failure the
 * backend cannot distinguish from a healthy one, so it is checked remotely. */
function upload({ entry }) {
  const remote = `${VOLUME}/${entry.path}`;
  console.log(`  uploading ${entry.filename} → ${remote}`);
  railway(["ssh", ...SERVICE, "--", "sh", "-c", `mkdir -p ${dirname(remote)} && cat > ${remote}`], {
    input: readFileSync(entry.archive),
  });

  const observed = capture(["ssh", ...SERVICE, "--", "sh", "-c",
    `sha256sum ${remote} | cut -d' ' -f1; wc -c < ${remote}`]);
  const [hash, size] = observed.trim().split(/\s+/);
  if (hash !== entry.sha256 || Number(size) !== entry.size) {
    throw new Error(`Upload of ${entry.filename} did not survive the wire (${hash} / ${size} bytes).`);
  }
  console.log("  remote hash and byte count match");
}

/** Variables are set with --skip-deploys and the running deployment is then
 * redeployed. `railway up` would rebuild from the linked GitHub source, which
 * is older than what production is actually running. */
function setVariables(plans) {
  const args = plans.flatMap(({ variables }) =>
    Object.entries(variables).flatMap(([key, value]) => ["--set", `${key}=${value}`]));
  railway(["variables", ...SERVICE, ...args, "--skip-deploys"]);
  railway(["redeploy", ...SERVICE, "--yes"]);
}

/** The only proof that matters: ask the feed what a Mac one version behind is
 * told, from outside, exactly as the app asks it. */
async function probe(plans, previousVersion) {
  for (const { target, entry } of plans) {
    const response = await fetch(`${baseUrl()}${feedPath(target, previousVersion)}`);
    const body = response.status === 200 ? await response.json() : null;
    const ok = body?.version === entry.version && body?.signature === entry.signature;
    console.log(`  ${target.platform}: ${response.status} ${body?.version ?? ""} ${ok ? "✓" : "✗"}`);
    if (!ok) throw new Error(`${target.platform} is not serving ${entry.version}.`);
  }
}

async function main() {
  const given = flag("dir");
  if (typeof given !== "string" || given === "") {
    throw new Error("Pass --dir <folder containing the .app.tar.gz and .sig artifacts>.");
  }
  const directory = resolve(given);
  if (!statSync(directory).isDirectory()) {
    throw new Error(`${directory} is not a folder.`);
  }
  const version = String(flag("version", config().version));
  const revision = String(flag("revision", "")) || spawnSync(
    "git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" },
  ).stdout.trim();
  const previous = String(flag("from", "0.0.1"));
  const publishedAt = new Date().toISOString();

  const plans = MAC_TARGETS.map((target) =>
    inspect(target, directory, version, revision, String(flag("notes", "")), publishedAt));

  console.log(`Vibyra ${version} (${revision})`);
  for (const { target, entry } of plans) {
    console.log(`  ${target.arch}: ${entry.sha256.slice(0, 12)}… ${entry.size} bytes — signature verified`);
    console.log(`         ${entry.path}`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing uploaded, no variables changed.");
    console.log("Re-run with --apply to publish. Variables that would be set:\n");
    for (const { variables } of plans) {
      for (const key of Object.keys(variables)) console.log(`  ${key}`);
    }
    return;
  }

  for (const plan of plans) upload(plan);
  setVariables(plans);
  console.log("Checking both feeds…");
  await probe(plans, previous);
  console.log(`\nVibyra ${version} is live. Open Macs will offer it within five minutes.`);
}

main().catch((error) => {
  console.error(`\npublish-macos-update: ${error.message}`);
  process.exit(1);
});
