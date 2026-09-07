import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { build } from "vite";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(resolve(tmpdir(), "vibyra-integrations-qa-"));
await build({ configFile: false, root, resolve: { dedupe: ["react", "react-dom"] },
  define: { "process.env.NODE_ENV": '"production"' }, build: { outDir: output, emptyOutDir: false,
    lib: { entry: resolve(root, "tests/ui/integrationsFixture.tsx"), formats: ["iife"], name: "IntegrationQA", fileName: () => "fixture.js", cssFileName: "fixture" } },
  oxc: { jsx: { runtime: "automatic" } },
});
await writeFile(resolve(output, "index.html"), '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const server = createServer(async (req, res) => {
  const name = req.url === "/fixture.js" ? "fixture.js" : req.url === "/fixture.css" ? "fixture.css" : "index.html";
  res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
  res.end(await readFile(resolve(output, name)));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const results = [];
try {
  const { chromium } = await import(process.env.VIBYRA_PLAYWRIGHT_MODULE || "playwright-core");
  browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"], headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const open = () => page.getByRole("button", { name: "Integrations", exact: true }).click();
  await open();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.getByRole("region", { name: "GitHub", exact: true }).waitFor();
  assert.equal(await dialog.locator(".integration-service").count(), 9);
  assert.equal(await page.locator(".shell").evaluate(el => el.inert), true);
  assert.equal(await dialog.evaluate(el => el.closest("[inert]") !== null), false);
  results.push("Modal is outside inert workspace; nine services load");
  await page.screenshot({ path: resolve(output, "dark.png") });
  const search = page.getByRole("searchbox"); await search.fill("shop");
  assert.equal(await dialog.locator(".integration-service").count(), 1);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const continueShop = page.getByRole("button", { name: "Continue to Shopify" });
  assert.equal(await continueShop.isDisabled(), true);
  await page.getByPlaceholder("my-shop.myshopify.com").fill("test.myshopify.com.evil.test");
  assert.equal(await continueShop.isDisabled(), true);
  await page.getByPlaceholder("my-shop.myshopify.com").fill("test.myshopify.com");
  assert.equal(await continueShop.isEnabled(), true);
  await continueShop.dblclick();
  await page.getByRole("button", { name: "Cancel connection" }).waitFor();
  assert.equal(await page.evaluate(() => window.qa.calls.filter(r => r.operation === "start").length), 1);
  results.push("Store validation and duplicate-connect protection");
  await page.getByRole("button", { name: "Cancel connection" }).click();
  await search.waitFor(); await search.fill("");
  const checkbox = page.getByRole("checkbox"); await checkbox.check();
  await page.waitForFunction(() => window.qa.connections[0].assigned);
  await checkbox.uncheck();
  await page.waitForFunction(() => !window.qa.connections[0].assigned);
  results.push("Explicit access can be enabled and removed");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("Connection checked:", { exact: false }).waitFor();
  await page.evaluate(() => { window.qa.fail = "check"; });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("alert").waitFor();
  results.push("Verification success and network failure are visible");
  await page.keyboard.press("Escape"); await dialog.waitFor({state: "detached"});
  assert.equal(await page.getByRole("button", { name: "Integrations", exact: true }).evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator(".shell").evaluate(el => el.inert), false);
  await page.evaluate(() => { window.qa.fail = ""; document.documentElement.dataset.theme = "light"; });
  await open(); await page.getByRole("checkbox").waitFor();
  await page.screenshot({ path: resolve(output, "light.png") });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  }
  results.push("Keyboard focus loops, Escape closes and restores focus");
  await page.setViewportSize({width: 390, height: 600});
  await dialog.locator(".modal__body").evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({path: resolve(output, "narrow.png")});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("button", {name: "Done", exact: true}).click();
  await page.evaluate(() => { window.qa.providers.forEach(p => p.ready = false); });
  await open(); await page.getByRole("button", {name: "Setup needed"}).first().waitFor();
  assert.equal(await page.getByRole("button", {name: "Setup needed"}).count(), 9);
  assert.equal(await page.getByRole("button", {name: "Setup needed"}).first().isDisabled(), true);
  results.push("Narrow layout and honest missing-registration state");
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({results, errors}, null, 2));
  console.log(`PASS: ${results.length} integration browser scenarios; ${output}`);
} finally { await browser?.close(); server.close(); }
