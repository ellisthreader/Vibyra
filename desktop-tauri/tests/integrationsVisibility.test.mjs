import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { integrationsUsable } from "../src/components/integrations/visibility.ts";

const provider = (ready) => ({ id: "gmail", provider: "google", name: "Gmail", description: "", ready });
const connection = { id: "c", service: "gmail", label: "a@b.test", environment: "live", status: "connected", assigned: false };

test("a release without any provider registration offers nothing to open", () => {
  assert.equal(integrationsUsable({ providers: [provider(false), provider(false)], connections: [] }), false);
  assert.equal(integrationsUsable({ providers: [], connections: [] }), false);
});

test("one registered provider is enough to offer integrations", () => {
  assert.equal(integrationsUsable({ providers: [provider(false), provider(true)], connections: [] }), true);
});

test("an already connected account stays reviewable if a registration is withdrawn", () => {
  assert.equal(integrationsUsable({ providers: [provider(false)], connections: [connection] }), true);
});

test("the button is hidden before the probe answers and a failed probe never shows it", () => {
  const hook = readFileSync(new URL("../src/components/integrations/useIntegrationsAvailable.ts", import.meta.url), "utf8");
  const button = readFileSync(new URL("../src/components/integrations/AgentIntegrationsButton.tsx", import.meta.url), "utf8");
  assert.match(hook, /useState\(false\)/);
  assert.match(hook, /\.catch\(\(\) => false\)/);
  assert.match(button, /if \(!available\) return null;/);
});
