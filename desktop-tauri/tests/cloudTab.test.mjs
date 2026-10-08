import assert from "node:assert/strict";
import test from "node:test";
import { defaultPick, recentFirst, connectError } from "../src/lib/cloudTab.ts";
import { cloudAuthority, CloudScope } from "../src/lib/cloudAvailability.ts";
import { travellers } from "../src/lib/cloudLift.ts";
import { createCloudSyncClient } from "../src/lib/cloudSyncClient.ts";

const connected = { enabled: true, devices: [{ id: "phone" }], active: ["phone"], pending: [] };
test("Cloud admission requires the current account and an active trusted phone", () => {
  assert.equal(cloudAuthority("a", "a", connected), "a");
  for (const phone of [null, { ...connected, enabled: false }, { ...connected, active: [] },
    { ...connected, active: ["untrusted"], pending: [{ id: "untrusted" }] }, { ...connected, devices: [] }]) {
    assert.equal(cloudAuthority("a", "a", phone), null);
  }
  assert.equal(cloudAuthority(null, "a", connected), null);
  assert.equal(cloudAuthority("b", "a", connected), null);
  assert.equal(cloudAuthority("a", "a", { ...connected, active: ["untrusted", "phone"] }), "a");
});
test("disconnect/reconnect invalidates captured requests while ordinary polling does not", () => {
  const scope = new CloudScope(); scope.update("a"); const before = scope.value;
  scope.update("a"); assert.equal(scope.value, before);
  scope.update(null); assert.equal(scope.value, null);
  scope.update("a"); assert.notEqual(scope.value, before);
  const reconnected = scope.value; scope.update("b"); assert.notEqual(scope.value, reconnected);
});
test("project defaults and ordering never add an implicit all-project grant", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(defaultPick(projects, "b"), "b");
  assert.deepEqual(recentFirst(projects, "c"), [{ id: "c" }, { id: "a" }, { id: "b" }]);
  assert.equal(defaultPick([], null), null);
});
test("the reviewed consent version and every false account choice reach native unchanged", async () => {
  const calls = []; const api = createCloudSyncClient(async (command, args) => { calls.push({ command, args }); return {}; });
  const choices = { consentVersion: 3, accounts: { codex: false, claude: true, github: false }, includeConversations: false, includeEnv: false };
  await api.connectMac([], choices);
  assert.deepEqual(calls, [{ command: "cloud_sync_connect_mac", args: { projects: [], ...choices } }]);
});
test("specific failures remain actionable", () => {
  assert.equal(connectError(new Error("consent_outdated")), "The cloud terms changed. Read them again to connect.");
  assert.equal(connectError("Upload connection timed out"), "Upload connection timed out");
});

test("different selected projects with the same name retain separate travellers", () => {
  const items = travellers(["Website", "Website"], ["openai"]);
  assert.equal(items.filter(item => item.kind === "project").length, 2);
});

test("existing Cloud management survives the only phone switching to Cloud; new setup stays socket-bound", async () => {
  const { cloudManagementAuthority } = await import("../src/lib/cloudAvailability.ts");
  const receipt = { ...connected, active: [], cloudManagement: "native-approval-1" };
  assert.equal(cloudAuthority("a", "a", receipt), null);
  assert.equal(cloudManagementAuthority("a", "a", receipt), "a:management:native-approval-1");
  for (const phone of [{ ...receipt, enabled: false }, { ...receipt, cloudManagement: null }]) {
    assert.equal(cloudManagementAuthority("a", "a", phone), null);
  }
  assert.equal(cloudManagementAuthority("b", "a", receipt), null);
  assert.equal(cloudManagementAuthority(null, "a", receipt), null);
  const scope = new CloudScope(); scope.update(cloudManagementAuthority("a", "a", receipt));
  const before = scope.value;
  scope.update(cloudManagementAuthority("a", "a", { ...receipt, cloudManagement: "native-approval-2" }));
  assert.notEqual(scope.value, before, "reapproval invalidates delayed responses");
});


test("a minted receipt keeps a captured Allow scope stable through the phone location switch", async () => {
  const { cloudManagementAuthority } = await import("../src/lib/cloudAvailability.ts");
  const phone = { ...connected, cloudManagement: "native-approval-1" };
  const management = new CloudScope(), setup = new CloudScope();
  management.update(cloudManagementAuthority("a", "a", phone));
  setup.update(cloudAuthority("a", "a", phone));
  const allow = management.value;
  const cloudPhone = { ...phone, active: [] };
  management.update(cloudManagementAuthority("a", "a", cloudPhone));
  setup.update(cloudAuthority("a", "a", cloudPhone));
  assert.equal(management.value, allow, "the in-flight Allow page stays mounted");
  assert.equal(setup.value, null, "initial setup cannot inherit management authority");
});


test("agent Cloud setup routes to allowed management and otherwise to phone pairing", async () => {
  const { cloudSetupSection, cloudManagementAuthority } = await import("../src/lib/cloudAvailability.ts");
  assert.equal(cloudSetupSection(cloudAuthority("a", "a", connected)), "cloud");
  assert.equal(cloudSetupSection(cloudManagementAuthority("a", "a", { ...connected, active: [], cloudManagement: "receipt" })), "cloud");
  assert.equal(cloudSetupSection(null), "iphone");
});
