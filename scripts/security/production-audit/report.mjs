import fs from "node:fs";
import process from "node:process";

import { auditCiRepository } from "./ci-repository.mjs";
import { auditEnvironment, parseEnv } from "./environment.mjs";
import { warn } from "./findings.mjs";
import { auditReleaseRepository } from "./release-repository.mjs";

function manualGates() {
  return [
    warn("manual.secret-revocation", "Verify exposed credentials were revoked provider-side."),
    warn("manual.branch-protection", "Verify the main ruleset and restricted bypass settings."),
    warn(
      "manual.deployment-protection",
      "Verify production environment reviewers and ref restrictions."
    ),
    warn("manual.signing", "Verify store and desktop artifact signing against the protected commit."),
    warn("manual.backup-restore", "Attach a successful isolated backup restore drill."),
    warn("manual.rollback", "Attach a migration and deployment rollback rehearsal."),
    warn("manual.monitoring", "Attach security alert and incident-response exercise evidence."),
    warn("manual.physical-devices", "Attach production-signed physical-device security results."),
    warn("manual.pentest", "Attach independent penetration-test and retest reports.")
  ];
}

export function renderText(report) {
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

export function buildReport(options) {
  const findings = [];
  if (options.ci || options.release) {
    findings.push(...auditCiRepository(options.root));
  }
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
