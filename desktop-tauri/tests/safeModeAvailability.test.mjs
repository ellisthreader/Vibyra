import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

/**
 * Safe mode gives every terminal its own Git branch. A project folder that is
 * not a repository has no branch to give, and used to answer a launch with the
 * raw `git` fatal ("not a git repository") on the workspace banner. It must
 * open the terminal in the folder instead, and only say something when Safe
 * mode genuinely failed somewhere it could have worked.
 */
const ops = {};
globalThis.__safeModeLaunch = ops;
const stubs = {
  "./resolveLaunchAccount": `export const resolveLaunchAccount = () => "chosen-account";`,
  "../ipc/workspace": `
    export const inspectSafeWorkspace = (...args) => globalThis.__safeModeLaunch.preflight(...args);
    export const safeWorkspaceSupported = (...args) => globalThis.__safeModeLaunch.supported(...args);`,
  "../state/launchApprovalStore": `
    export const useLaunchApprovalStore = { getState: () => ({ request: r => globalThis.__safeModeLaunch.approvals.push(r) }) };`,
  "../state/launchSettingsStore": `
    export const useLaunchSettingsStore = { getState: () => ({ get: () => globalThis.__safeModeLaunch.preferences }) };`,
  "../state/settingsStore": `
    export const useSettingsStore = { getState: () => ({ settings: globalThis.__safeModeLaunch.settings }) };`,
  "../state/terminalStore": `
    export const useTerminalStore = { getState: () => ({ spawnAgent: (...args) => globalThis.__safeModeLaunch.spawn(...args) }) };`,
  "../state/workspaceStore": `
    export const useWorkspaceStore = { getState: () => ({ setError: message => globalThis.__safeModeLaunch.errors.push(message) }) };`,
  "./launchConversationTerminal": `
    export const launchConversationTerminal = async () => "conversation";`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/configuredLaunch.ts") && specifier in stubs) {
      return { url: `test:safe-mode${specifier}`, shortCircuit: true };
    }
    // The app's own imports are extensionless; Node needs the real file name.
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const specifier = url.startsWith("test:safe-mode") ? url.slice("test:safe-mode".length) : null;
    if (specifier) return { format: "module", shortCircuit: true, source: stubs[specifier] };
    return next(url, context);
  },
});
const { launchConfigured } = await import("../src/lib/configuredLaunch.ts");
hooks.deregister();

const AGENT = { id: "claude", name: "Claude Code", installed: true };
const PROJECT = { id: "plain", name: "Applications", root: "/Users/someone/Applications" };

function setup(safeMode = true) {
  ops.errors = [];
  ops.approvals = [];
  ops.spawned = [];
  ops.preferences = { safeMode, permission: "standard", tokenSource: "accounts", effort: "medium", accountByProvider: {} };
  ops.settings = { agentView: "terminal", projects: [PROJECT] };
  ops.spawn = async (agent, projectId, options) => { ops.spawned.push(options); return 7; };
  ops.supported = async () => true;
  ops.preflight = async () => ({ repository: true, changedFiles: 0, fingerprint: "clean" });
  return ops;
}

test("a folder with no repository opens the terminal instead of refusing", async () => {
  setup();
  ops.supported = async () => false;
  ops.preflight = async () => assert.fail("a plain folder must not be scanned for changes");

  const started = await launchConfigured(AGENT, PROJECT.id, {});

  assert.deepEqual(started, [{ paneId: 7 }]);
  assert.equal(ops.spawned[0].workspaceMode, "shared");
  assert.equal(ops.spawned[0].cwd, PROJECT.root);
  assert.deepEqual(ops.errors, []);
});

test("a repository still checkpoints local changes before branching", async () => {
  setup();
  ops.preflight = async () => ({ repository: true, changedFiles: 4, fingerprint: "dirty" });

  const started = await launchConfigured(AGENT, PROJECT.id, {});

  assert.deepEqual(started, []);
  assert.equal(ops.approvals.length, 1);
  assert.equal(ops.approvals[0].changedFiles, 4);
  assert.deepEqual(ops.spawned, []);
  assert.deepEqual(ops.errors, []);
});

test("a clean repository branches without asking", async () => {
  setup();
  await launchConfigured(AGENT, PROJECT.id, {});
  assert.equal(ops.spawned[0].workspaceMode, "safe");
});

test("Safe mode still says so when it fails somewhere it could have worked", async () => {
  setup();
  ops.supported = async () => { throw new Error("git is unavailable"); };

  const started = await launchConfigured(AGENT, PROJECT.id, {});

  assert.deepEqual(started, []);
  assert.deepEqual(ops.spawned, []);
  assert.match(ops.errors[0], /Safe mode can't run in Applications/);
});

test.after(() => { delete globalThis.__safeModeLaunch; });

 test('plain terminals ignore AI billing preferences', async () => {
  setup(false); ops.preferences.tokenSource = 'vibyra';
  await launchConfigured({id:'shell', name:'Terminal'}, PROJECT.id);
  assert.equal(ops.spawned.length,1); assert.deepEqual(ops.errors,[]);
 });
 test('a failed multi-terminal launch stops after the first failure', async () => {
  setup(false); let attempts = 0;
  ops.spawn = async () => { attempts++; return null; };
  assert.deepEqual(await launchConfigured(AGENT, PROJECT.id, {count:4}), []);
  assert.equal(attempts,1);
 });
 test('resolved account is passed to the actual PTY launch', async () => {
  setup(false); await launchConfigured(AGENT,PROJECT.id);
  assert.equal(ops.spawned[0].accountId,'chosen-account');
 });
