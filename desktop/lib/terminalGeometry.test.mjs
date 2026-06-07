import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("xterm uses native-sized text and does not force the screen beyond its viewport", () => {
  const runtime = readFileSync(
    new URL("../assets/app.terminals-pty-runtime.js", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../assets/app.runtime-fixes.css", import.meta.url),
    "utf8",
  );

  assert.match(runtime, /fontSize:\s*14/);
  assert.match(runtime, /lineHeight:\s*1\.15/);
  assert.match(runtime, /screenHeight\s*\/\s*Number\(xterm\?\.rows\)/);
  assert.match(css, /\.terminal-xterm\s*\{[^}]*padding:\s*8px;/s);
  assert.doesNotMatch(
    css,
    /\.terminal-xterm \.xterm-screen,[^{]*\{[^}]*height:\s*100%/s,
  );
});
