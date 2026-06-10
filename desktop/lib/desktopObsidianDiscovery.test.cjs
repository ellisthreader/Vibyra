const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  discoverObsidianVaults,
  importDiscoveredObsidianVault
} = require("./desktopObsidianDiscovery.cjs");

test("discovers registry and common-folder Obsidian vaults without exposing paths", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "vibyra-obsidian-"));
  const documents = path.join(home, "Documents");
  const registryVault = path.join(home, "Notes", "Work");
  const scannedVault = path.join(documents, "Personal");
  const registryPath = path.join(home, "obsidian.json");
  await createVault(registryVault, "Work.md");
  await createVault(scannedVault, "Personal.md");
  await writeFile(registryPath, JSON.stringify({
    vaults: { work: { path: registryVault } }
  }));

  const vaults = await discoverObsidianVaults({
    home,
    registryPaths: [registryPath],
    scanRoots: [documents],
    scanWhenRegistered: true
  });

  assert.deepEqual(vaults.map(({ name, location, noteCount }) => ({ name, location, noteCount })), [
    { name: "Personal", location: "Documents", noteCount: 1 },
    { name: "Work", location: "Notes", noteCount: 1 }
  ]);
  assert.equal(vaults.every((vault) => !JSON.stringify(vault).includes(home)), true);
});

test("registered Obsidian vaults skip the fallback filesystem scan", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "vibyra-obsidian-fast-"));
  const registeredVault = path.join(home, "Notes", "Work");
  const scannedVault = path.join(home, "Documents", "Personal");
  const registryPath = path.join(home, "obsidian.json");
  await createVault(registeredVault, "Work.md");
  await createVault(scannedVault, "Personal.md");
  await writeFile(registryPath, JSON.stringify({
    vaults: { work: { path: registeredVault } }
  }));

  const vaults = await discoverObsidianVaults({
    home,
    registryPaths: [registryPath],
    scanRoots: [path.join(home, "Documents")]
  });

  assert.deepEqual(vaults.map((vault) => vault.name), ["Work"]);
});

test("imports a discovered vault by opaque id", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "vibyra-obsidian-import-"));
  const vaultPath = path.join(home, "Documents", "Project Notes");
  await createVault(vaultPath, "Project/Architecture.md");
  const [vault] = await discoverObsidianVaults({
    home,
    registryPaths: [],
    scanRoots: [path.join(home, "Documents")]
  });

  const result = await importDiscoveredObsidianVault(vault.id);

  assert.equal(result.canceled, false);
  assert.deepEqual(result.files.map(({ path: notePath }) => notePath), ["Project/Architecture.md"]);
});

async function createVault(vaultPath, notePath) {
  await mkdir(path.join(vaultPath, ".obsidian"), { recursive: true });
  const filePath = path.join(vaultPath, notePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "# Note");
}
