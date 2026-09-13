import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { build } from "vite";
import { modalChecks } from "../tests/ui/teammateModalChecks.mjs";
import { recoveryChecks } from "../tests/ui/teammateRecoveryChecks.mjs";
import { saveChecks } from "../tests/ui/teammateSaveChecks.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.VIBYRA_TEAMMATE_QA_DIR || await mkdtemp(resolve(tmpdir(), "vibyra-teammate-qa-"));
await build({ configFile: false, root, resolve: { dedupe: ["react", "react-dom"] },
  define: { "process.env.NODE_ENV": '"production"' },
  build: { outDir: output, emptyOutDir: false, minify: false, lib: {
    entry: resolve(root, "tests/ui/teammateFixture.tsx"), formats: ["iife"], name: "TeammateQA", fileName: () => "fixture.js", cssFileName: "fixture",
  } }, oxc: { jsx: { runtime: "automatic" } },
});
await writeFile(resolve(output, "index.html"), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const server = createServer(async (req, res) => {
  const name = req.url === "/fixture.js" ? "fixture.js" : req.url === "/fixture.css" ? "fixture.css" : "index.html";
  res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
  res.end(await readFile(resolve(output, name)));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
const { chromium } = process.env.VIBYRA_PLAYWRIGHT_MODULE ? await import(process.env.VIBYRA_PLAYWRIGHT_MODULE) : await import("playwright-core");
browser = await chromium.launch({ executablePath: process.env.VIBYRA_CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"], headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
const failures = []; const results = [];
page.on("pageerror", error => failures.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => !!window.qa);
  await modalChecks(page, results, output);
  await saveChecks(page, results);
  await recoveryChecks(page, results);
  assert.deepEqual(failures, [], "Uncaught browser errors");
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, failures }, null, 2));
  console.log(`PASS: ${results.length} teammate browser checks; evidence: ${output}`);
} finally { await browser?.close(); server.close(); }
