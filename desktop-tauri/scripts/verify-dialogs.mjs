// Every workspace pop-up on sample data, in both themes, at a real window size.
// Run from `desktop-tauri/`:  node scripts/verify-dialogs.mjs [name ...]
// Screenshots go to ../output/dialogs (or DIALOGS_OUT).
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const ALL = ["phone", "phone-typing", "remote-pair", "remote-session", "remote-active", "run", "launch", "close", "plan", "report", "settings-iphone", "toasts", "picker", "settings"];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const out = resolve(process.env.DIALOGS_OUT ?? "../output/dialogs");
await mkdir(out, { recursive: true });
const main = await readFile("src/main.tsx", "utf8");
const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)].map((m) => `import "/src/${m[1].slice(2)}";`).join("\n");
const html = `<!doctype html><meta charset="utf-8"><div id="root" class="app"></div><script type="module">import "@fontsource-variable/inter";\n${styles}\nimport "/tests/dialogGalleryFixture.tsx";</script>`;
const server = await createServer({
  configFile: "vite.config.ts", logLevel: "error", server: { port: 0, strictPort: false, hmr: false, fs: { strict: false } },
  plugins: [{ name: "fixture", configureServer(s) {
    s.middlewares.use("/fixture", async (req, res) => { res.setHeader("Content-Type", "text/html"); res.end(await s.transformIndexHtml(req.url ?? "/", html)); });
  } }],
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const errors = [];
try {
  for (const name of names) {
    for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      page.on("pageerror", (error) => errors.push(`${name}/${theme}: ${error.message}`));
      await page.goto(`${url}/fixture?d=${name}${theme === "light" ? "&light" : ""}`);
      try { await page.locator("[role=dialog], .vtoast, .modal, .corner-status").first().waitFor({ timeout: 10_000 }); }
      catch { errors.push(`${name}/${theme}: no dialog`); await page.close(); continue; }
      await page.waitForTimeout(500);
      await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
      await page.screenshot({ path: `${out}/${name}-${theme}.png` });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`PASS: ${names.length} dialogs × 2 themes → ${out}`);
