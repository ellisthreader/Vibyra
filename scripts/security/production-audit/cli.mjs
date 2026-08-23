import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { defaultRoot } from "./repository-files.mjs";
import { buildReport, renderText } from "./report.mjs";

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

export function runCli() {
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
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderText(report);
  process.stdout.write(output);
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output, { mode: 0o600 });
  }
  if (report.summary.fail > 0) process.exitCode = 1;
}
