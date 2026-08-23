#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { runCli } from "./production-audit/cli.mjs";

export { parseEnv, auditEnvironment } from "./production-audit/environment.mjs";
export { auditWorkflowText } from "./production-audit/workflow.mjs";
export { auditCiRepository } from "./production-audit/ci-repository.mjs";
export { auditReleaseRepository } from "./production-audit/release-repository.mjs";

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === invokedPath) {
  runCli();
}
