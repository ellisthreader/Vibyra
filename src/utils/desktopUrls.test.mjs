import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const originalEnv = {
  relay: process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL,
  desktop: process.env.EXPO_PUBLIC_DESKTOP_URL,
  strict: process.env.EXPO_PUBLIC_STRICT_DESKTOP_URLS
};

test.afterEach(() => {
  restoreEnv("EXPO_PUBLIC_DESKTOP_RELAY_URL", originalEnv.relay);
  restoreEnv("EXPO_PUBLIC_DESKTOP_URL", originalEnv.desktop);
  restoreEnv("EXPO_PUBLIC_STRICT_DESKTOP_URLS", originalEnv.strict);
});

test("strict desktop URLs allow private HTTP and exact configured HTTPS relays", async () => {
  process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL = "https://relay.vibyra.example";
  const { trustedDesktopUrl } = await loadDesktopUrls("https://relay.vibyra.example");

  assert.equal(trustedDesktopUrl("http://192.168.1.20:4317/"), "http://192.168.1.20:4317");
  assert.equal(trustedDesktopUrl("http://10.0.0.8:4317"), "http://10.0.0.8:4317");
  assert.equal(trustedDesktopUrl("http://localhost:4317"), "http://localhost:4317");
  assert.equal(trustedDesktopUrl("http://[::1]:4317"), "http://[::1]:4317");
  assert.equal(trustedDesktopUrl("https://relay.vibyra.example"), "https://relay.vibyra.example");
});

test("strict desktop URLs reject bearer-leak and lookalike targets", async () => {
  process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL = "https://relay.vibyra.example";
  const { trustedDesktopUrl } = await loadDesktopUrls("https://relay.vibyra.example");

  for (const value of [
    "http://8.8.8.8:4317",
    "http://relay.vibyra.example:4317",
    "https://relay.vibyra.example.evil.test",
    "https://other.example",
    "http://user:pass@192.168.1.20:4317",
    "vibyra://pair",
    "http://192.168.1.20:4317/path",
    "http://192.168.1.20:4317?next=https://evil.test",
    "http://2130706433:4317"
  ]) {
    assert.equal(trustedDesktopUrl(value), null, value);
  }
});

test("emergency rollback permits ordinary HTTP and HTTPS origins only", async () => {
  process.env.EXPO_PUBLIC_STRICT_DESKTOP_URLS = "false";
  const { trustedDesktopUrl } = await loadDesktopUrls("");

  assert.equal(trustedDesktopUrl("http://203.0.113.8:4317"), "http://203.0.113.8:4317");
  assert.equal(trustedDesktopUrl("https://temporary-relay.example"), "https://temporary-relay.example");
  assert.equal(trustedDesktopUrl("http://user@203.0.113.8:4317"), null);
});

test("health and remembered URL merging use the centralized trust policy", async () => {
  process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL = "https://relay.vibyra.example";
  const desktopUrls = await loadDesktopUrls("https://relay.vibyra.example");
  const helpers = await loadTypeScriptModule(new URL("../context/pairingHelpers.ts", import.meta.url), {
    "../utils/desktopUrls": desktopUrls
  });

  assert.deepEqual(helpers.desktopConnectionUrls("http://192.168.1.20:4317", [
    "http://10.0.0.9:4317",
    "https://relay.vibyra.example",
    "https://relay.vibyra.example.evil.test",
    "http://8.8.8.8:4317"
  ]), [
    "http://192.168.1.20:4317",
    "http://10.0.0.9:4317",
    "https://relay.vibyra.example"
  ]);

  let fetchedUrl = "";
  const discovery = await loadTypeScriptModule(new URL("../context/pairingDiscovery.ts", import.meta.url), {
    "../utils/desktopUrls": desktopUrls,
    "../utils/deviceIdentity": { appDeviceName: () => "Test Phone" },
    "../utils/network": {
      fetchWithTimeout: async (url) => {
        fetchedUrl = url;
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              machineName: "Desktop",
              connectionUrls: [
                "http://10.0.0.9:4317",
                "http://8.8.8.8:4317",
                "https://relay.vibyra.example.evil.test"
              ]
            };
          }
        };
      }
    },
    "../utils/ids": { wait: async () => {} },
    "./pairingHelpers": pairingHelperMocks()
  });
  const health = await discovery.checkHealth("http://192.168.1.20:4317");
  assert.equal(fetchedUrl, "http://192.168.1.20:4317/health");
  assert.deepEqual(health.connectionUrls, ["http://10.0.0.9:4317"]);

  fetchedUrl = "";
  assert.equal(await discovery.checkHealth("http://8.8.8.8:4317"), null);
  assert.equal(fetchedUrl, "");

  const networkSource = await readFile(new URL("./network.ts", import.meta.url), "utf8");
  assert.match(networkSource, /const explicitDesktopUrl = trustedDesktopUrl\(/);
  assert.match(networkSource, /return trustedDesktopUrl\(host \? `http:\/\/\$\{host\}:4317`/);
});

test("pairing deep links reject public, credentialed, and lookalike desktop URLs", async () => {
  process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL = "https://relay.vibyra.example";
  const desktopUrls = await loadDesktopUrls("https://relay.vibyra.example");
  const pairing = await loadTypeScriptModule(new URL("../context/pairingDeepLink.ts", import.meta.url), {
    react: { useCallback: () => {}, useEffect: () => {}, useRef: () => ({ current: null }), useState: () => [0, () => {}] },
    "react-native": { Linking: {} },
    "../utils/desktopUrls": desktopUrls
  });

  assert.deepEqual(
    pairing.parsePairingDeepLink("vibyra://pair?code=ABCD23&url=http%3A%2F%2F192.168.1.20%3A4317"),
    { code: "ABCD23", url: "http://192.168.1.20:4317" }
  );
  assert.equal(pairing.parsePairingDeepLink("vibyra://pair?code=ABCD23&url=http%3A%2F%2F8.8.8.8%3A4317"), null);
  assert.equal(pairing.parsePairingDeepLink("vibyra://pair?code=ABCD23&url=https%3A%2F%2Frelay.vibyra.example.evil.test"), null);
  assert.equal(pairing.parsePairingDeepLink("vibyra://pair?code=ABCD23&url=http%3A%2F%2Fuser%40192.168.1.20%3A4317"), null);
});

test("pair request IDs use cryptographic Web Crypto when available", async () => {
  const { makePairRequestId } = await loadDesktopUrls("");
  const id = makePairRequestId();
  assert.match(id, /^phone-pair-(?:[0-9a-f-]{32,36}|compat-)/);
});

async function loadDesktopUrls(relayUrl) {
  return loadTypeScriptModule(new URL("./desktopUrls.ts", import.meta.url), {
    "../data/appData": { DESKTOP_RELAY_URL: relayUrl }
  });
}

async function loadTypeScriptModule(sourceUrl, mocks) {
  const source = await readFile(sourceUrl, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function pairingHelperMocks() {
  return {
    APPROVAL_POLL_MS: 500,
    APPROVAL_TIMEOUT_MS: 90_000,
    HEALTH_SCAN_BATCH_SIZE: 48,
    LAN_APPROVAL_STATUS_TIMEOUT_MS: 5000,
    LAN_HEALTH_TIMEOUT_MS: 1200,
    LAN_PAIR_TIMEOUT_MS: 7000,
    RELAY_APPROVAL_STATUS_TIMEOUT_MS: 3500,
    RELAY_HEALTH_TIMEOUT_MS: 1400,
    RELAY_PAIR_TIMEOUT_MS: 3500,
    firstMatching: async () => null
  };
}
