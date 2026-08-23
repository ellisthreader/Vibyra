import { fail, pass } from "./findings.mjs";

const disabledKeys = [
  "VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED",
  "VIBYRA_LEGACY_PHONE_TOKEN_ENABLED",
  "VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED",
  "VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED",
  "PUBLISH_REVIEW_TEMPORARILY_DISABLED"
];

const enabledKeys = [
  "VIBYRA_PAIR_RATE_LIMIT_ENABLED",
  "VIBYRA_LAN_V2_REQUIRED",
  "OPENAI_MODERATION_ENABLED",
  "OPENAI_MODERATION_FAIL_CLOSED"
];

const requiredKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "APPLE_IAP_SHARED_SECRET",
  "GOOGLE_IAP_PACKAGE_NAME",
  "GOOGLE_IAP_SERVICE_ACCOUNT_JSON",
  "GOOGLE_AUTH_CLIENT_IDS",
  "APPLE_AUTH_CLIENT_IDS"
];

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalizedLine = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalizedLine.indexOf("=");
    if (separator < 1) continue;
    const key = normalizedLine.slice(0, separator).trim();
    let value = normalizedLine.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function normalized(value) {
  return String(value ?? "").trim();
}

function isFalse(value) {
  return ["false", "0", "off", "no"].includes(normalized(value).toLowerCase());
}

function isTrue(value) {
  return ["true", "1", "on", "yes"].includes(normalized(value).toLowerCase());
}

export function auditEnvironment(values) {
  const results = [];
  const exact = (key, expected) => {
    results.push(
      normalized(values[key]).toLowerCase() === expected
        ? pass(`environment.${key}`, `${key} has the required production value.`)
        : fail(`environment.${key}`, `${key} must be ${expected}.`)
    );
  };
  const falseValue = (key) => {
    results.push(
      isFalse(values[key])
        ? pass(`environment.${key}`, `${key} is disabled.`)
        : fail(`environment.${key}`, `${key} must be explicitly false.`)
    );
  };
  const trueValue = (key) => {
    results.push(
      isTrue(values[key])
        ? pass(`environment.${key}`, `${key} is enabled.`)
        : fail(`environment.${key}`, `${key} must be explicitly true.`)
    );
  };
  const present = (key) => {
    results.push(
      normalized(values[key])
        ? pass(`environment.${key}`, `${key} is configured.`)
        : fail(`environment.${key}`, `${key} is required.`)
    );
  };

  exact("APP_ENV", "production");
  falseValue("APP_DEBUG");
  results.push(
    normalized(values.APP_KEY).length >= 32
      ? pass("environment.APP_KEY", "APP_KEY is configured.")
      : fail("environment.APP_KEY", "APP_KEY is missing or too short.")
  );
  results.push(
    /^https:\/\//i.test(normalized(values.APP_URL))
      ? pass("environment.APP_URL", "APP_URL uses HTTPS.")
      : fail("environment.APP_URL", "APP_URL must use HTTPS.")
  );

  falseValue("VIBYRA_CORS_ALLOW_ANY_ORIGIN");
  const corsOrigins = normalized(values.VIBYRA_CORS_ALLOWED_ORIGINS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  results.push(
    corsOrigins.length > 0 &&
      corsOrigins.every((value) => /^https:\/\/[^*]+$/i.test(value))
      ? pass("environment.VIBYRA_CORS_ALLOWED_ORIGINS", "CORS origins are explicit HTTPS URLs.")
      : fail(
          "environment.VIBYRA_CORS_ALLOWED_ORIGINS",
          "CORS origins must be a non-empty list of explicit HTTPS URLs without wildcards."
        )
  );

  for (const key of disabledKeys) falseValue(key);
  for (const key of enabledKeys) trueValue(key);
  exact("EXPO_PUBLIC_LAN_V2_MODE", "required");
  for (const key of requiredKeys) present(key);

  return results;
}
