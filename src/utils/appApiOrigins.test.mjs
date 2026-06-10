import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const originsUrl = new URL("./appApiOrigins.ts", import.meta.url);

async function loadOriginsModule() {
  const source = await readFile(originsUrl, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("production candidates contain exactly the configured HTTPS origin", async () => {
  const { createAppApiOriginPolicy } = await loadOriginsModule();
  const policy = createAppApiOriginPolicy({
    configuredUrl: "https://api.vibyra.example/path?ignored=true",
    developmentDefaultUrl: "http://127.0.0.1:8000",
    developmentFallbackUrls: ["http://localhost:8000", "http://192.168.1.20:8000"],
    isDevelopment: false
  });

  assert.deepEqual(policy.candidates, ["https://api.vibyra.example"]);
  assert.deepEqual(policy.allowedOrigins, ["https://api.vibyra.example"]);
  assert.equal(policy.redirect, "error");
});

test("production rejects HTTP and unapproved remembered origins", async () => {
  const {
    PRODUCTION_APP_API_URL,
    approvedAppApiUrl,
    appApiRetryCandidates,
    createAppApiOriginPolicy,
    isAllowedAppApiUrl
  } = await loadOriginsModule();
  const policy = createAppApiOriginPolicy({
    configuredUrl: "http://localhost:8000",
    developmentDefaultUrl: "http://127.0.0.1:8000",
    developmentFallbackUrls: ["http://192.168.1.20:8000"],
    isDevelopment: false
  });

  assert.deepEqual(policy.candidates, [PRODUCTION_APP_API_URL]);
  assert.equal(isAllowedAppApiUrl(policy, "http://localhost:8000"), false);
  assert.equal(isAllowedAppApiUrl(policy, "https://unapproved.example"), false);
  assert.equal(isAllowedAppApiUrl(policy, PRODUCTION_APP_API_URL), true);
  assert.equal(approvedAppApiUrl(policy, "http://localhost:8000"), null);
  assert.equal(approvedAppApiUrl(policy, "https://unapproved.example"), null);
  assert.equal(approvedAppApiUrl(policy, PRODUCTION_APP_API_URL), PRODUCTION_APP_API_URL);
  assert.deepEqual(appApiRetryCandidates(policy, PRODUCTION_APP_API_URL), []);
});

test("development retains configured, Expo, browser, and localhost fallbacks", async () => {
  const { createAppApiOriginPolicy } = await loadOriginsModule();
  const policy = createAppApiOriginPolicy({
    configuredUrl: "http://10.0.0.8:8000",
    developmentDefaultUrl: "http://10.0.0.9:8000",
    developmentFallbackUrls: [
      "http://10.0.0.9:8000",
      "http://browser-host:8000",
      "http://127.0.0.1:8000"
    ],
    isDevelopment: true
  });

  assert.deepEqual(policy.candidates, [
    "http://10.0.0.8:8000",
    "http://10.0.0.9:8000",
    "http://browser-host:8000",
    "http://127.0.0.1:8000"
  ]);
  assert.equal(policy.redirect, "follow");
});

test("normal and streaming retries use the shared origin policy", async () => {
  const [normalSource, streamSource] = await Promise.all([
    readFile(new URL("./appApi.ts", import.meta.url), "utf8"),
    readFile(new URL("./appApiStream.ts", import.meta.url), "utf8")
  ]);

  assert.match(normalSource, /getAppApiRetryCandidateUrls\(failedApiUrl\)/);
  assert.match(streamSource, /getAppApiRetryCandidateUrls\(failedApiUrl\)/);
  assert.match(normalSource, /redirect:\s*getAppApiFetchRedirect\(\)/);
  assert.match(streamSource, /redirect:\s*getAppApiFetchRedirect\(\)/);
});
