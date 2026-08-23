import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../screens/OnboardingScreen.tsx", import.meta.url), "utf8");
const liveSync = readFileSync(new URL("./useLiveSync.ts", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("./useCloudSync.ts", import.meta.url), "utf8");
const requests = readFileSync(new URL("./useRequests.ts", import.meta.url), "utf8");

test("first-run routing honors onboarding and PC setup completion", () => {
  assert.match(app, /!app\.onboardingComplete/);
  assert.match(app, /!app\.pcSetupComplete && !app\.pcSetupSkipped/);
  assert.match(app, /<OnboardingScreen \/>/);
  assert.match(onboarding, /onboardingComplete \? 7 : 0/);
});

test("mobile recurring work is stable and cloud writes are deduplicated", () => {
  assert.match(liveSync, /requestsRef\.current\.agentRequest/);
  assert.match(liveSync, /\[connectionKey\]/);
  assert.doesNotMatch(liveSync, /\[connection, requests, setters, onConnectionLost\]/);
  assert.match(cloudSync, /lastSyncedPayloadRef/);
  assert.match(cloudSync, /inFlightPayloadsRef/);
  assert.match(cloudSync, /syncChainRef/);
  assert.match(cloudSync, /latestPayloadKeyRef/);
  assert.match(requests, /useMemo\(\(\) => \(\{ agentRequest, desktopRequest \}\)/);
});
