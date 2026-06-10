#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "../..");
const actionRefPattern = /^[0-9a-f]{40}$/i;

function finding(id, status, message, severity = "error") {
  return { id, status, severity, message };
}

function pass(id, message) {
  return finding(id, "pass", message, "info");
}

function fail(id, message) {
  return finding(id, "fail", message);
}

function warn(id, message) {
  return finding(id, "manual", message, "warning");
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
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

function workflowJobsWithoutTimeout(text) {
  const missing = [];
  const lines = text.split(/\r?\n/);
  let inJobs = false;
  let currentJob = null;
  let currentHasTimeout = false;

  const finishJob = () => {
    if (currentJob && !currentHasTimeout) missing.push(currentJob);
  };

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (inJobs && /^[^\s#][^:]*:\s*$/.test(line)) {
      finishJob();
      currentJob = null;
      inJobs = false;
      continue;
    }
    const jobMatch = inJobs ? line.match(/^  ([A-Za-z0-9_-]+):\s*$/) : null;
    if (jobMatch) {
      finishJob();
      currentJob = jobMatch[1];
      currentHasTimeout = false;
      continue;
    }
    if (currentJob && /^    timeout-minutes:\s*\d+\s*$/.test(line)) {
      currentHasTimeout = true;
    }
  }
  finishJob();
  return missing;
}

export function auditWorkflowText(relativePath, text) {
  const results = [];
  const actionRefs = [...text.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)];
  const unpinned = actionRefs
    .filter((match) => !match[1].startsWith("./") && !actionRefPattern.test(match[2]))
    .map((match) => `${match[1]}@${match[2]}`);

  results.push(
    unpinned.length === 0
      ? pass(`workflow.${relativePath}.actions`, "All external actions use full commit SHAs.")
      : fail(
          `workflow.${relativePath}.actions`,
          `Unpinned external actions: ${unpinned.join(", ")}.`
        )
  );

  const missingTimeouts = workflowJobsWithoutTimeout(text);
  results.push(
    missingTimeouts.length === 0
      ? pass(`workflow.${relativePath}.timeouts`, "Every job has a timeout.")
      : fail(
          `workflow.${relativePath}.timeouts`,
          `Jobs missing timeout-minutes: ${missingTimeouts.join(", ")}.`
        )
  );

  const hasReadOnlyBaseline =
    /^permissions:\s*\n(?: {2}[A-Za-z-]+:\s*(?:read|write)\s*\n)* {2}contents:\s*read\s*$/m.test(
      text
    );
  results.push(
    hasReadOnlyBaseline
      ? pass(`workflow.${relativePath}.permissions`, "Workflow declares contents: read.")
      : fail(
          `workflow.${relativePath}.permissions`,
          "Workflow must declare a top-level contents: read permission baseline."
        )
  );

  results.push(
    text.includes("pull_request_target:")
      ? fail(
          `workflow.${relativePath}.trigger`,
          "pull_request_target is prohibited for workflows that execute repository code."
        )
      : pass(`workflow.${relativePath}.trigger`, "No pull_request_target trigger is present.")
  );

  return results;
}

export function auditCiRepository(root = defaultRoot) {
  const results = [];
  const requiredFiles = [
    "SECURITY.md",
    "docs/security/production-release-gates.md",
    "scripts/security/run-actionlint.sh",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/workflows/security.yml",
    ".github/workflows/dependency-review.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/production-security-gate.yml"
  ];

  for (const relativePath of requiredFiles) {
    results.push(
      exists(root, relativePath)
        ? pass(`repository.${relativePath}`, `${relativePath} exists.`)
        : fail(`repository.${relativePath}`, `${relativePath} is required.`)
    );
  }

  const workflowDir = path.join(root, ".github/workflows");
  if (fs.existsSync(workflowDir)) {
    for (const name of fs.readdirSync(workflowDir).filter((item) => /\.ya?ml$/.test(item))) {
      const relativePath = `.github/workflows/${name}`;
      results.push(...auditWorkflowText(relativePath, readText(root, relativePath)));
    }
  }

  if (exists(root, ".github/dependabot.yml")) {
    const dependabot = readText(root, ".github/dependabot.yml");
    const ecosystems = ["npm", "composer", "github-actions"];
    for (const ecosystem of ecosystems) {
      results.push(
        dependabot.includes(`package-ecosystem: ${ecosystem}`)
          ? pass(`dependabot.${ecosystem}`, `${ecosystem} updates are configured.`)
          : fail(`dependabot.${ecosystem}`, `${ecosystem} updates are not configured.`)
      );
    }
  }

  return results;
}

function buildPropertiesAndroid(expo) {
  const entry = (expo.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
  );
  return entry?.[1]?.android ?? {};
}

export function auditReleaseRepository(root = defaultRoot) {
  const results = [];
  let app;
  let eas;
  try {
    app = readJson(root, "app.json");
    eas = readJson(root, "eas.json");
  } catch (error) {
    return [fail("release.config.parse", `Cannot parse release configuration: ${error.message}`)];
  }

  const expo = app.expo ?? {};
  const androidBuild = buildPropertiesAndroid(expo);
  results.push(
    androidBuild.usesCleartextTraffic === false
      ? pass("release.android.cleartext", "Android cleartext traffic is disabled.")
      : fail("release.android.cleartext", "Android usesCleartextTraffic must be false.")
  );

  results.push(
    expo.runtimeVersion
      ? pass("release.expo.runtime", "Expo runtimeVersion is configured.")
      : fail("release.expo.runtime", "Expo runtimeVersion is required for OTA compatibility.")
  );

  results.push(
    typeof expo.ios?.config?.usesNonExemptEncryption === "boolean"
      ? pass("release.ios.export", "Expo export-compliance configuration is explicit.")
      : fail(
          "release.ios.export",
          "Set ios.config.usesNonExemptEncryption after cryptography export review."
        )
  );

  const associatedDomains = expo.ios?.associatedDomains ?? [];
  results.push(
    associatedDomains.some((value) => String(value).startsWith("applinks:"))
      ? pass("release.links.ios", "An iOS associated domain is configured.")
      : fail("release.links.ios", "Verified iOS Universal Links are not configured.")
  );

  const intentFilters = expo.android?.intentFilters ?? [];
  results.push(
    intentFilters.some((filter) => filter?.autoVerify === true)
      ? pass("release.links.android", "An auto-verified Android App Link is configured.")
      : fail("release.links.android", "Verified Android App Links are not configured.")
  );

  const production = eas.build?.production ?? {};
  results.push(
    eas.cli?.appVersionSource === "remote"
      ? pass("release.eas.version", "EAS uses remote version management.")
      : fail("release.eas.version", "EAS appVersionSource must be remote.")
  );
  results.push(
    production.autoIncrement === true
      ? pass("release.eas.increment", "Production build numbers auto-increment.")
      : fail("release.eas.increment", "Production autoIncrement must be true.")
  );
  results.push(
    production.channel === "production"
      ? pass("release.eas.channel", "Production builds use the production update channel.")
      : fail("release.eas.channel", "Production EAS channel must be production.")
  );

  const apiUrl = production.env?.EXPO_PUBLIC_API_URL ?? "";
  results.push(
    /^https:\/\//i.test(apiUrl)
      ? pass("release.api.https", "Production API URL uses HTTPS.")
      : fail("release.api.https", "Production API URL must use HTTPS.")
  );

  const desktopUrl = production.env?.EXPO_PUBLIC_DESKTOP_URL ?? "";
  results.push(
    !/^http:\/\//i.test(desktopUrl)
      ? pass("release.desktop.cleartext", "Production profile has no cleartext desktop URL.")
      : fail(
          "release.desktop.cleartext",
          "Production EXPO_PUBLIC_DESKTOP_URL must not use cleartext HTTP."
        )
  );

  return results;
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

  for (const key of [
    "VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED",
    "VIBYRA_LEGACY_PHONE_TOKEN_ENABLED",
    "VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED",
    "VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED",
    "PUBLISH_REVIEW_TEMPORARILY_DISABLED"
  ]) {
    falseValue(key);
  }
  for (const key of [
    "VIBYRA_PAIR_RATE_LIMIT_ENABLED",
    "VIBYRA_LAN_V2_REQUIRED",
    "OPENAI_MODERATION_ENABLED",
    "OPENAI_MODERATION_FAIL_CLOSED"
  ]) {
    trueValue(key);
  }
  exact("EXPO_PUBLIC_LAN_V2_MODE", "required");

  for (const key of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "APPLE_IAP_SHARED_SECRET",
    "GOOGLE_IAP_PACKAGE_NAME",
    "GOOGLE_IAP_SERVICE_ACCOUNT_JSON",
    "GOOGLE_AUTH_CLIENT_IDS",
    "APPLE_AUTH_CLIENT_IDS"
  ]) {
    present(key);
  }

  return results;
}

function manualGates() {
  return [
    warn("manual.secret-revocation", "Verify exposed credentials were revoked provider-side."),
    warn("manual.branch-protection", "Verify the main ruleset and restricted bypass settings."),
    warn("manual.deployment-protection", "Verify production environment reviewers and ref restrictions."),
    warn("manual.signing", "Verify store and desktop artifact signing against the protected commit."),
    warn("manual.backup-restore", "Attach a successful isolated backup restore drill."),
    warn("manual.rollback", "Attach a migration and deployment rollback rehearsal."),
    warn("manual.monitoring", "Attach security alert and incident-response exercise evidence."),
    warn("manual.physical-devices", "Attach production-signed physical-device security results."),
    warn("manual.pentest", "Attach independent penetration-test and retest reports.")
  ];
}

function parseArguments(argv) {
  const options = {
    root: defaultRoot,
    ci: false,
    release: false,
    environment: false,
    envFile: null,
    format: "text",
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--ci") options.ci = true;
    else if (argument === "--release") options.release = true;
    else if (argument === "--environment") options.environment = true;
    else if (argument === "--root") options.root = path.resolve(argv[++index]);
    else if (argument === "--env-file") options.envFile = path.resolve(argv[++index]);
    else if (argument === "--format") options.format = argv[++index];
    else if (argument === "--output") options.output = path.resolve(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.ci && !options.release) options.ci = true;
  if (options.envFile) options.environment = true;
  if (!["text", "json"].includes(options.format)) {
    throw new Error("--format must be text or json.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/security/audit-production-config.mjs --ci
  node scripts/security/audit-production-config.mjs --release --environment
  node scripts/security/audit-production-config.mjs --release --env-file /secure/production.env

Options:
  --ci                 Audit repository security automation.
  --release            Audit repository automation and static release configuration.
  --environment        Audit the current process environment without printing values.
  --env-file PATH      Audit values from an env file without printing values.
  --format text|json   Select report format.
  --output PATH        Also write the report to a file.
  --root PATH          Override the repository root.
`;
}

function renderText(report) {
  const symbols = { pass: "PASS", fail: "FAIL", manual: "MANUAL" };
  const lines = report.findings.map(
    (item) => `${symbols[item.status]} ${item.id}: ${item.message}`
  );
  lines.push(
    `Summary: ${report.summary.pass} passed, ${report.summary.fail} failed, ` +
      `${report.summary.manual} manual gates.`
  );
  return `${lines.join("\n")}\n`;
}

function buildReport(options) {
  const findings = [];
  if (options.ci || options.release) findings.push(...auditCiRepository(options.root));
  if (options.release) {
    findings.push(...auditReleaseRepository(options.root));
    findings.push(...manualGates());
  }
  if (options.environment) {
    const values = options.envFile
      ? parseEnv(fs.readFileSync(options.envFile, "utf8"))
      : process.env;
    findings.push(...auditEnvironment(values));
  }
  return {
    generatedAt: new Date().toISOString(),
    root: options.root,
    modes: {
      ci: options.ci || options.release,
      release: options.release,
      environment: options.environment
    },
    summary: {
      pass: findings.filter((item) => item.status === "pass").length,
      fail: findings.filter((item) => item.status === "fail").length,
      manual: findings.filter((item) => item.status === "manual").length
    },
    findings
  };
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const report = buildReport(options);
  const output =
    options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderText(report);
  process.stdout.write(output);
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output, { mode: 0o600 });
  }
  if (report.summary.fail > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  await main();
}
