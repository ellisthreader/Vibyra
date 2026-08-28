import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("startup checks promptly and keeps a short stable dwell", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");

  assert.match(hook, /STARTUP_CHECK_TIMEOUT_MS = 8_000/);
  assert.match(hook, /MINIMUM_STARTUP_DWELL_MS = 600/);
  assert.match(hook, /\.check\(STARTUP_CHECK_TIMEOUT_MS\)/);
  assert.match(hook, /MINIMUM_STARTUP_DWELL_MS - elapsed/);
});

test("the startup gate stays above both authentication and workspace mounting", async () => {
  const app = await read("../src/App.tsx");
  const gate = app.indexOf("if (!startup.complete)");
  const auth = app.indexOf('if (status !== "signedIn")');
  const workspace = app.lastIndexOf("<WorkspaceApp />");

  assert.match(app, /const startup = useStartupUpdate\(\)/);
  assert.match(app, /void useAccountStore\.getState\(\)\.restore\(\)/);
  assert.ok(gate >= 0 && gate < auth && auth < workspace);
});

test("the native boot splash hands over to the packaged updater immediately", async () => {
  const app = await read("../src/App.tsx");

  assert.match(app, /import \{ signalAppReady \} from "\.\/lib\/bootHandoff"/);
  assert.match(app, /if \(!startup\.complete \|\| status !== "restoring"\)/);
  assert.match(app, /signalAppReady\(\)/);
});

test("the signed-in workspace preloads once without blocking updater first paint", async () => {
  const app = await read("../src/App.tsx");

  assert.doesNotMatch(app, /^import \{ WorkspaceApp \}/m);
  assert.match(app, /workspaceModule = import\("\.\/components\/layout\/WorkspaceApp"\)/);
  assert.match(app, /if \(status === "signedIn"\) void loadWorkspaceApp\(\)\.catch/);
  assert.match(app, /workspaceModule = null;\s*throw error/);
  assert.match(app, /<Suspense fallback=\{<div className="boot">Opening Vibyra…<\/div>\}>/);
});

test("authentication is split and only preloads after restoration chooses it", async () => {
  const app = await read("../src/App.tsx");

  assert.doesNotMatch(app, /^import \{ AuthScreen \}/m);
  assert.match(app, /authModule = import\("\.\/components\/auth\/AuthScreen"\)/);
  assert.match(app, /else if \(status !== "restoring"\) void loadAuthScreen\(\)\.catch/);
  assert.match(app, /authModule = null;\s*throw error/);
  assert.match(app, /<AuthScreen \/>/);
});

test("the terminal close guard cannot arm on the startup screen", async () => {
  const app = await read("../src/App.tsx");
  const hook = await read("../src/lib/useStartupUpdate.ts");
  const workspace = await read("../src/components/layout/WorkspaceApp.tsx");

  assert.doesNotMatch(app, /useSessionLifecycle/);
  assert.doesNotMatch(hook, /useSessionLifecycle|armCloseGuard/);
  assert.match(workspace, /useSessionLifecycle\(\)/);
});

test("development bypasses the updater without flashing a gate", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");

  assert.match(hook, /const development = import\.meta\.env\.DEV/);
  assert.match(hook, /useState\(development\)/);
  assert.match(hook, /if \(!development\) void run\("check"\)/);
});

test("a packaged launch checks, downloads and installs in order", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");
  const check = hook.indexOf(".check(STARTUP_CHECK_TIMEOUT_MS)");
  const download = hook.indexOf(".download()");
  const install = hook.indexOf(".installAtStartup()");

  assert.ok(check >= 0 && check < download, "the feed must be checked before download");
  assert.ok(download < install, "the package must be downloaded before install");
  assert.doesNotMatch(hook, /saveSessionNow|\.restart\(\)/);
  assert.match(hook, /successful install exits or relaunches this process/i);
});

test("a successful native install cannot leave an eternal handoff screen", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");

  assert.match(hook, /RELAUNCH_HANDOFF_GRACE_MS = 3_000/);
  assert.match(hook, /if \(installed\) \{[\s\S]*await wait\(RELAUNCH_HANDOFF_GRACE_MS\)/);
  assert.match(hook, /fail\("relaunch", RELAUNCH_FALLBACK_ERROR\)/);
  assert.match(hook, /if \(startAt === "relaunch"\)[\s\S]*await relaunch\(\)/);
  assert.match(hook, /failedStageRef\.current === "relaunch"[\s\S]*status: "idle"/);
});

test("failures retry their own stage and can safely open the app", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");

  for (const stage of ["check", "download", "install"]) {
    assert.match(hook, new RegExp(`fail\\("${stage}"`));
  }
  assert.match(hook, /failedStageRef\.current = stage/);
  assert.match(hook, /run\(failedStageRef\.current\)/);
  assert.match(hook, /phase !== "failed" \|\| runningRef\.current/);
});

test("the coordinator prevents duplicate work and ignores an unmounted result", async () => {
  const hook = await read("../src/lib/useStartupUpdate.ts");

  assert.match(hook, /if \(runningRef\.current\) return/);
  assert.match(hook, /runningRef\.current = true/);
  assert.match(hook, /finally \{\s*runningRef\.current = false/);
  assert.match(hook, /if \(!mountedRef\.current\) return/g);
  assert.match(hook, /return \(\) => \{\s*mountedRef\.current = false/);
});

test("workspace polling neither duplicates startup nor runs automatically in development", async () => {
  const watch = await read("../src/lib/useUpdateWatch.ts");

  assert.match(watch, /if \(import\.meta\.env\.DEV\) return/);
  assert.match(watch, /getState\(\)\.checkState === "idle"/);
  assert.match(watch, /setInterval\(run, POLL_INTERVAL_MS\)/);
});

test("workspace notifications announce startup state before observing later changes", async () => {
  const notifications = await read("../src/lib/useUpdateNotifications.ts");
  const snapshot = notifications.indexOf("announce(useUpdateStore.getState())");
  const subscription = notifications.indexOf("useUpdateStore.subscribe(announce)");

  assert.ok(snapshot >= 0 && snapshot < subscription);
});
