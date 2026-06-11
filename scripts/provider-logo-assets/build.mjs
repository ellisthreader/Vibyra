import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const script of ["acquire.mjs", "generate.mjs", "validate.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script)], {
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
