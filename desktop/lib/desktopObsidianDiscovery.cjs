const { createHash } = require("node:crypto");
const { access, readFile, readdir, realpath } = require("node:fs/promises");
const { constants } = require("node:fs");
const { homedir, platform } = require("node:os");
const path = require("node:path");
const { readVaultFiles } = require("./desktopMemoryPicker.cjs");

const MAX_SCAN_DEPTH = 4;
const MAX_SCANNED_DIRECTORIES = 2500;
const MAX_RESULTS = 12;
const IGNORED = new Set([
  ".git", ".expo", ".vibyra-agent", "node_modules", "vendor",
  "Library", "AppData", "Applications"
]);
const discoveredVaults = new Map();

async function discoverObsidianVaults(options = {}) {
  const home = options.home || homedir();
  const registryPaths = options.registryPaths || obsidianRegistryPaths(home);
  const scanRoots = options.scanRoots || commonScanRoots(home);
  const candidates = new Set(await readRegistryVaults(registryPaths));
  const scanState = { directories: 0 };
  for (const root of scanRoots) {
    await scanForVaults(root, 0, candidates, scanState);
    if (candidates.size >= MAX_RESULTS) break;
  }

  const vaults = [];
  for (const candidate of candidates) {
    if (vaults.length >= MAX_RESULTS) break;
    const vault = await describeVault(candidate, home);
    if (!vault) continue;
    discoveredVaults.set(vault.id, vault.absolutePath);
    vaults.push({
      id: vault.id,
      name: vault.name,
      location: vault.location,
      noteCount: vault.noteCount
    });
  }
  return vaults.sort((left, right) => left.name.localeCompare(right.name));
}

async function importDiscoveredObsidianVault(id) {
  const vaultPath = discoveredVaults.get(String(id || ""));
  if (!vaultPath) throw new Error("That Obsidian vault is no longer available. Scan again.");
  if (!(await hasObsidianMarker(vaultPath))) {
    discoveredVaults.delete(String(id));
    throw new Error("That folder is no longer an Obsidian vault.");
  }
  return { canceled: false, files: await readVaultFiles(vaultPath) };
}

async function readRegistryVaults(registryPaths) {
  const vaults = [];
  for (const registryPath of registryPaths) {
    try {
      const parsed = JSON.parse(await readFile(registryPath, "utf8"));
      Object.values(parsed?.vaults || {}).forEach((entry) => {
        if (typeof entry?.path === "string" && entry.path) vaults.push(entry.path);
      });
    } catch {}
  }
  return vaults;
}

async function scanForVaults(root, depth, candidates, state) {
  if (depth > MAX_SCAN_DEPTH || state.directories >= MAX_SCANNED_DIRECTORIES) return;
  let children;
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  state.directories += 1;
  if (children.some((child) => child.isDirectory() && child.name === ".obsidian")) {
    candidates.add(root);
    return;
  }
  for (const child of children) {
    if (candidates.size >= MAX_RESULTS || state.directories >= MAX_SCANNED_DIRECTORIES) break;
    if (!child.isDirectory() || child.name.startsWith(".") || IGNORED.has(child.name)) continue;
    await scanForVaults(path.join(root, child.name), depth + 1, candidates, state);
  }
}

async function describeVault(candidate, home) {
  try {
    const absolutePath = await realpath(candidate);
    if (!(await hasObsidianMarker(absolutePath))) return null;
    return {
      id: createHash("sha256").update(absolutePath).digest("hex").slice(0, 24),
      absolutePath,
      name: path.basename(absolutePath) || "Obsidian vault",
      location: displayLocation(absolutePath, home),
      noteCount: await countMarkdownFiles(absolutePath)
    };
  } catch {
    return null;
  }
}

async function hasObsidianMarker(vaultPath) {
  try {
    await access(path.join(vaultPath, ".obsidian"), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function countMarkdownFiles(root) {
  let count = 0;
  const walk = async (current) => {
    if (count >= 500) return;
    let children;
    try {
      children = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (child.name.startsWith(".") || IGNORED.has(child.name)) continue;
      if (child.isDirectory()) await walk(path.join(current, child.name));
      else if (child.isFile() && /\.md$/i.test(child.name)) count += 1;
    }
  };
  await walk(root);
  return count;
}

function displayLocation(vaultPath, home) {
  const relative = path.relative(home, vaultPath);
  if (!relative || relative.startsWith("..")) return "This computer";
  const parts = relative.split(path.sep);
  if (parts.length === 1) return "Home";
  return parts.slice(0, -1).join(" / ") || "Home";
}

function obsidianRegistryPaths(home) {
  if (platform() === "darwin") return [path.join(home, "Library/Application Support/obsidian/obsidian.json")];
  if (platform() === "win32") {
    return [path.join(process.env.APPDATA || path.join(home, "AppData/Roaming"), "obsidian/obsidian.json")];
  }
  return [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "obsidian/obsidian.json")];
}

function commonScanRoots(home) {
  return ["Desktop", "Documents", "Downloads", "Obsidian", "Notes", "Dropbox", "OneDrive"]
    .map((name) => path.join(home, name));
}

module.exports = {
  discoverObsidianVaults,
  importDiscoveredObsidianVault,
  readRegistryVaults
};
