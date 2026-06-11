#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderIntroForModel } from "../../desktop/lib/aiTerminalOpenRouterCli.mjs";
import {
  providerInfoForModel,
  registeredProviderFamilies
} from "../../desktop/lib/aiTerminalVibyraAgentBranding.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const defaultOutput = resolve(repoRoot, "../Vibyra-Agent-Provider-Terminal-Visual-Review.pdf");
const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.output || defaultOutput);
const workDir = mkdtempSync(join(tmpdir(), "vibyra-provider-terminal-review-"));
const chrome = findChrome();
const xtermScriptUrl = pathToFileURL(join(repoRoot, "desktop/assets/vendor.xterm.js")).href;
const xtermStylesUrl = pathToFileURL(join(repoRoot, "desktop/assets/vendor.xterm.css")).href;
const providers = registeredProviderFamilies();
const pngPaths = [];

try {
  for (const [index, provider] of providers.entries()) {
    const modelKey = `${provider}/visual-review`;
    const info = providerInfoForModel(modelKey);
    const intro = renderIntroForModel({
      modelKey,
      reasoningEffort: "medium",
      cwd: repoRoot,
      columns: 100,
      color: true,
      permissionMode: "standard",
      tokenMode: "vibyra"
    });
    const baseName = `${String(index + 1).padStart(2, "0")}-${provider}`;
    const htmlPath = join(workDir, `${baseName}.html`);
    const pngPath = join(workDir, `${baseName}.png`);
    writeFileSync(htmlPath, renderPage({
      provider,
      providerName: info.name,
      modelKey,
      intro,
      position: index + 1,
      total: providers.length
    }), "utf8");
    captureScreenshot(chrome, htmlPath, pngPath);
    pngPaths.push(pngPath);
  }

  const combineResult = spawnSync("python3", [
    join(scriptDir, "combine_pdf.py"),
    "--output", outputPath,
    "--expected", String(providers.length),
    ...pngPaths
  ], { encoding: "utf8" });
  if (combineResult.status !== 0) {
    throw new Error(combineResult.stderr.trim() || combineResult.stdout.trim() || "PIL PDF generation failed.");
  }

  const summary = JSON.parse(combineResult.stdout);
  if (summary.image_count !== providers.length || summary.page_count !== providers.length) {
    throw new Error(`Count verification failed: ${JSON.stringify(summary)}`);
  }

  console.log(JSON.stringify({
    output: outputPath,
    providers: providers.length,
    pngs: summary.image_count,
    pdfPages: summary.page_count,
    chrome,
    temporaryDirectory: args.keepTemp ? workDir : null
  }, null, 2));
} finally {
  if (!args.keepTemp) rmSync(workDir, { recursive: true, force: true });
}

function captureScreenshot(chromePath, htmlPath, pngPath) {
  const result = spawnSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1500",
    "--window-size=1440,900",
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href
  ], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(pngPath)) {
    throw new Error(`Chrome capture failed for ${htmlPath}: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function renderPage({ provider, providerName, modelKey, intro, position, total }) {
  const pageData = JSON.stringify({ intro }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(providerName)} provider terminal review</title>
  <link rel="stylesheet" href="${xtermStylesUrl}">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      background:
        radial-gradient(circle at 15% 0%, rgba(109, 59, 255, 0.20), transparent 34%),
        linear-gradient(145deg, #100d18 0%, #09080d 58%, #050507 100%);
      color: #f4efff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 54px 70px;
    }
    header {
      align-items: end;
      display: flex;
      justify-content: space-between;
      margin: 0 auto 24px;
      max-width: 1300px;
    }
    h1 { font-size: 30px; letter-spacing: -0.03em; margin: 0 0 7px; }
    .subtitle, .counter { color: #aaa1ba; font-size: 14px; }
    .counter { font-variant-numeric: tabular-nums; letter-spacing: 0.08em; text-transform: uppercase; }
    .terminal-frame {
      background: #09090c;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      box-shadow: 0 30px 85px rgba(0, 0, 0, 0.48);
      height: 720px;
      margin: 0 auto;
      max-width: 1300px;
      overflow: hidden;
      padding: 28px 30px;
    }
    #terminal { height: 100%; width: 100%; }
    .xterm { height: 100%; padding: 0; }
    .xterm-viewport { overflow: hidden !important; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(providerName)}</h1>
      <div class="subtitle">${escapeHtml(provider)} theme · ${escapeHtml(modelKey)} · actual renderIntroForModel()</div>
    </div>
    <div class="counter">Provider ${position} / ${total}</div>
  </header>
  <main class="terminal-frame"><div id="terminal" aria-label="${escapeHtml(providerName)} terminal"></div></main>
  <script src="${xtermScriptUrl}"></script>
  <script>
    const data = ${pageData};
    const terminal = new Terminal({
      cols: 100,
      rows: 38,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: '"DejaVu Sans Mono", "Liberation Mono", monospace',
      fontSize: 14,
      lineHeight: 1.05,
      letterSpacing: 0,
      scrollback: 0,
      theme: {
        background: "#09090c",
        foreground: "#eee9f6",
        cursor: "#8b5cff",
        black: "#09090c",
        brightBlack: "#716a7d",
        white: "#d8d2e2",
        brightWhite: "#ffffff"
      }
    });
    terminal.open(document.getElementById("terminal"));
    terminal.write(data.intro, () => {
      terminal.refresh(0, terminal.rows - 1);
      document.documentElement.dataset.ready = "true";
    });
  </script>
</body>
</html>`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error("Headless Google Chrome or Chromium was not found. Set CHROME_BIN to its executable.");
}

function parseArgs(values) {
  const parsed = { output: "", keepTemp: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--keep-temp") parsed.keepTemp = true;
    else if (value === "--output" && values[index + 1]) parsed.output = values[++index];
    else if (value === "--help") {
      console.log("Usage: node scripts/provider-terminal-review/run.mjs [--output FILE] [--keep-temp]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
