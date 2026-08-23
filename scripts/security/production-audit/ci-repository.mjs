import fs from "node:fs";
import path from "node:path";

import { fail, pass } from "./findings.mjs";
import {
  defaultRoot,
  exists,
  readText
} from "./repository-files.mjs";
import { auditWorkflowText } from "./workflow.mjs";

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

const requiredEcosystems = ["npm", "composer", "github-actions"];

export function auditCiRepository(root = defaultRoot) {
  const results = [];

  for (const relativePath of requiredFiles) {
    results.push(
      exists(root, relativePath)
        ? pass(`repository.${relativePath}`, `${relativePath} exists.`)
        : fail(`repository.${relativePath}`, `${relativePath} is required.`)
    );
  }

  const workflowDir = path.join(root, ".github/workflows");
  if (fs.existsSync(workflowDir)) {
    const workflowNames = fs
      .readdirSync(workflowDir)
      .filter((item) => /\.ya?ml$/.test(item));

    for (const name of workflowNames) {
      const relativePath = `.github/workflows/${name}`;
      results.push(...auditWorkflowText(relativePath, readText(root, relativePath)));
    }
  }

  if (exists(root, ".github/dependabot.yml")) {
    const dependabot = readText(root, ".github/dependabot.yml");
    for (const ecosystem of requiredEcosystems) {
      results.push(
        dependabot.includes(`package-ecosystem: ${ecosystem}`)
          ? pass(`dependabot.${ecosystem}`, `${ecosystem} updates are configured.`)
          : fail(`dependabot.${ecosystem}`, `${ecosystem} updates are not configured.`)
      );
    }
  }

  return results;
}
