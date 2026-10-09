import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = {
  proof: "verify-glib-backport.py",
  test: "test-glib-backport.py",
  "test-proof": "test-glib-proof.py",
};
const script = scripts[process.argv[2]];
if (!script) throw new Error("Expected proof, test or test-proof");
const here = dirname(fileURLToPath(import.meta.url));
execFileSync(process.platform === "win32" ? "python" : "python3",
  [join(here, script)], { stdio: "inherit" });
