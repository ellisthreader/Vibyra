import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("account domains separate session, usage, and stable semantic actions", async () => {
  const contexts = await source("./AccountContexts.tsx");
  assert.match(contexts, /AccountSessionContext/);
  assert.match(contexts, /AccountUsageContext/);
  assert.match(contexts, /AccountActionsContext/);
  assert.match(contexts, /useStableAction\(app\.authenticateWith\)/);
  assert.match(contexts, /useStableAction\(app\.signOut\)/);
});

test("desktop permission context preserves project-scoped always approval", async () => {
  const contexts = await source("./DesktopContexts.tsx");
  assert.match(contexts, /editApprovals: app\.editApprovals/);
  assert.match(contexts, /mode === "always" \? "auto" : "ask", projectId/);
  assert.match(contexts, /if \(mode === "always" && !projectId\) return/);
});

test("isolated account and permission leaves no longer subscribe to the full app facade", async () => {
  const leaves = await Promise.all([
    source("../screens/AuthScreen.tsx"),
    source("../screens/workspace/inline/PcPermissionControl.tsx"),
    source("../screens/workspace/inline/profile/ProfileHero.tsx"),
    source("../screens/workspace/inline/profile/BillingSheet.tsx")
  ]);
  for (const leaf of leaves) assert.doesNotMatch(leaf, /useAppContext/);
});
