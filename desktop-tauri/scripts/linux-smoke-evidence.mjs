import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Smoke captures come only from a fresh local app profile and loopback driver.
// Keep each run private and cap WebDriver output before writing CI evidence.
export function createEvidenceRun(root) {
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, "run-"));
}

export function writeEvidence(directory, name, value) {
  if (!/^[a-z0-9][a-z0-9.-]*\.(png|json|log)$/.test(name)) {
    throw new Error("Invalid smoke evidence filename");
  }
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const limit = name.endsWith(".png") ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
  if (bytes.length > limit) throw new Error("Smoke evidence exceeded its size limit");
  writeFileSync(join(directory, name), bytes, { flag: "wx", mode: 0o600 });
}
