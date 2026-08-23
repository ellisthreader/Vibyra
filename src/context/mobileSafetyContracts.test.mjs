import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(file) {
  return readFile(new URL(file, import.meta.url), "utf8");
}

function functionBody(input, name) {
  const start = input.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected function ${name}`);
  const open = input.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < input.length; index += 1) {
    if (input[index] === "{") depth += 1;
    if (input[index] === "}") depth -= 1;
    if (depth === 0) return input.slice(open + 1, index);
  }
  throw new Error(`Unclosed function ${name}`);
}

test("pairing requires desktop approval and stages a separate phone confirmation", async () => {
  const pairing = await source("./usePairingActions.ts");
  const pairMachine = functionBody(pairing, "pairMachine");
  const desktopApproval = pairMachine.indexOf("waitForDesktopApproval(");
  const phoneApproval = pairMachine.indexOf("setPendingPhoneApproval({");

  assert.ok(desktopApproval >= 0 && phoneApproval > desktopApproval);
  assert.doesNotMatch(pairMachine, /setConnection\s*\(/);
  assert.match(pairMachine, /Allow this phone to control your coding machine/);
});

test("phone confirmation is the only step that establishes the staged connection", async () => {
  const connection = await source("./usePairingConnectionActions.ts");
  const confirm = functionBody(connection, "confirmPhonePermission");
  const establish = functionBody(connection, "establishConnection");

  assert.match(confirm, /if \(!state\.pendingPhoneApproval\) return/);
  assert.match(confirm, /const result = state\.pendingPhoneApproval/);
  assert.match(confirm, /establishConnection\(\{/);
  assert.ok(establish.indexOf("setConnection(") < establish.indexOf("setPendingPhoneApproval(null)"));
  assert.ok(establish.indexOf("setPendingPhoneApproval(null)") < establish.indexOf("setPaired(true)"));
});

test("edit apply, deny, and always approval remain scoped to one project", async () => {
  const edits = await source("./useEditPermissionActions.ts");
  const approve = functionBody(edits, "approveEdits");
  const deny = functionBody(edits, "denyEdits");
  const always = functionBody(edits, "setAlwaysAllow");

  assert.match(approve, /state\.chatThreads\[projectId\]/);
  assert.match(approve, /applyPendingEdits\(messageId, projectId, pendingApplyId\)/);
  assert.match(deny, /state\.chatThreads\[projectId\]/);
  assert.match(deny, /markDenied\(messageId, projectId/);
  assert.match(always, /\{ \.\.\.current, \[projectId\]: "always" \}/);
  assert.doesNotMatch(always, /desktopPermissionMode/);
});

test("pending edit operations send only the selected run identifier", async () => {
  const edits = await source("./useEditPermissionActions.ts");
  const apply = functionBody(edits, "applyPendingEdits");
  const deny = functionBody(edits, "denyEdits");

  assert.match(apply, /"\/agents\/apply"/);
  assert.match(apply, /JSON\.stringify\(\{ runId: pendingApplyId \}\)/);
  assert.match(deny, /"\/agents\/discard"/);
  assert.match(deny, /JSON\.stringify\(\{ runId: message\.pendingApplyId \}\)/);
});

test("preview approval and denial are bound to the pending project", async () => {
  const commands = await source("../screens/workspace/hooks/workspaceCommandActions.ts");
  const followUp = functionBody(commands, "handlePreviewServerFollowUp");
  const decision = functionBody(commands, "applyPreviewServerDecision");

  assert.match(followUp, /pending\.projectId !== target\.projectId/);
  assert.match(followUp, /applyPreviewServerDecision\(prompt, target, false\)/);
  assert.match(followUp, /applyPreviewServerDecision\(prompt, target, true\)/);
  assert.match(decision, /pendingPreviewServerRef\.current = null/);
  assert.match(decision, /if \(!approved\)/);
  assert.match(decision, /status: "cancelled"/);
  assert.ok(decision.indexOf("if (!approved)") < decision.indexOf("runApprovedPreviewServer("));
});

test("sign-out, cache clear, and expiry clear the correct secret class", async () => {
  const auth = await source("./useAuthContextActions.ts");
  const signOut = functionBody(auth, "signOut");
  const clearCache = functionBody(auth, "clearCache");
  const expire = functionBody(auth, "expireSession");

  assert.match(signOut, /clearPersistedSecrets\(\)/);
  assert.match(signOut, /secure storage cleanup could not be verified/);
  assert.match(signOut, /"\/api\/auth\/logout"/);
  assert.match(signOut, /method: "DELETE"/);
  assert.match(signOut, /\.catch\(\(\) => undefined\)/);
  assert.match(signOut, /setAuthToken\(""\)/);
  assert.match(signOut, /setRememberedDesktops\(\[\]\)/);
  assert.ok(signOut.indexOf('setAuthToken("")') < signOut.indexOf("await clearPersistedSecrets()"));
  assert.ok(signOut.indexOf("await clearPersistedSecrets()") < signOut.indexOf("await revocation"));
  assert.match(clearCache, /clearPersistedDesktopTokens\(\)/);
  assert.doesNotMatch(clearCache, /clearPersistedAuthToken|setAuthToken/);
  assert.match(expire, /clearPersistedAuthToken\(\)/);
  assert.doesNotMatch(expire, /clearPersistedDesktopTokens|setRememberedDesktops/);
});
