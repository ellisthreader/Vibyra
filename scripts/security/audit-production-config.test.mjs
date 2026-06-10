import assert from "node:assert/strict";
import test from "node:test";

import {
  auditEnvironment,
  auditWorkflowText,
  parseEnv
} from "./audit-production-config.mjs";

const pinnedSha = "0123456789abcdef0123456789abcdef01234567";

test("parseEnv supports quoted values without evaluating the file", () => {
  const values = parseEnv(`
    # comment
    APP_ENV=production
    APP_URL="https://api.vibyra.app"
    export APP_DEBUG='false'
  `);

  assert.deepEqual(values, {
    APP_ENV: "production",
    APP_URL: "https://api.vibyra.app",
    APP_DEBUG: "false"
  });
});

test("workflow audit requires SHA pins, timeouts, and read-only contents", () => {
  const workflow = `
name: Test
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@${pinnedSha}
`;

  assert.equal(
    auditWorkflowText(".github/workflows/test.yml", workflow).filter(
      (item) => item.status === "fail"
    ).length,
    0
  );
});

test("workflow audit rejects mutable action tags", () => {
  const workflow = `
name: Test
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
`;

  const results = auditWorkflowText(".github/workflows/test.yml", workflow);
  assert.ok(results.some((item) => item.id.endsWith(".actions") && item.status === "fail"));
});

test("environment audit never includes secret values in findings", () => {
  const secret = "base64:do-not-print-this-secret-value";
  const values = {
    APP_ENV: "production",
    APP_DEBUG: "false",
    APP_KEY: secret,
    APP_URL: "https://api.vibyra.app",
    VIBYRA_CORS_ALLOWED_ORIGINS: "https://vibyra.app",
    VIBYRA_CORS_ALLOW_ANY_ORIGIN: "false",
    VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED: "false",
    VIBYRA_LEGACY_PHONE_TOKEN_ENABLED: "false",
    VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED: "false",
    VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED: "false",
    VIBYRA_PAIR_RATE_LIMIT_ENABLED: "true",
    VIBYRA_LAN_V2_REQUIRED: "true",
    EXPO_PUBLIC_LAN_V2_MODE: "required",
    OPENAI_MODERATION_ENABLED: "true",
    OPENAI_MODERATION_FAIL_CLOSED: "true",
    PUBLISH_REVIEW_TEMPORARILY_DISABLED: "false",
    STRIPE_SECRET_KEY: secret,
    STRIPE_WEBHOOK_SECRET: secret,
    APPLE_IAP_SHARED_SECRET: secret,
    GOOGLE_IAP_PACKAGE_NAME: "app.vibyra.mobile",
    GOOGLE_IAP_SERVICE_ACCOUNT_JSON: secret,
    GOOGLE_AUTH_CLIENT_IDS: "client-id",
    APPLE_AUTH_CLIENT_IDS: "app.vibyra.mobile"
  };

  const results = auditEnvironment(values);
  assert.equal(results.filter((item) => item.status === "fail").length, 0);
  assert.equal(JSON.stringify(results).includes(secret), false);
});
