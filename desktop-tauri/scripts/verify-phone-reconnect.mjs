import assert from "node:assert/strict";
import { chromium, webkit } from "playwright-core";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

// Optional frozen source for reproducing failures without changing the checkout.
const baseline = process.argv.find((arg) => arg.startsWith("--baseline="))?.slice(11);
const bundle = await build({ entryPoints: ["tests/phoneApprovalFixture.tsx"], bundle: true, write: false,
  plugins: baseline ? [{ name: "baseline-dialog", setup(builder) {
    builder.onLoad({ filter: /\/components\/phone\/(PhoneApprovalModal|PhoneConnectionDialog|PhoneConnectionResult)\.tsx$/ },
      async ({ path }) => ({ contents: await readFile(resolve(baseline, "src/components/phone", basename(path)), "utf8"), loader: "tsx" }));
  } }] : [],
  outdir: "/tmp/phone-reconnect-fixture", format: "esm", jsx: "automatic", loader: { ".woff2": "dataurl" } });
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const shots = process.argv.includes("--screenshots");
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/fixture.js" ? "application/javascript" : "text/html");
  res.end(req.url === "/fixture.js" ? js : `<!doctype html><style>${css}</style><div id="root"></div><script type="module" src="/fixture.js"></script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = process.argv.includes("--webkit") ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const errors = [];
const failures = [];
const only = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
const check = async (name, run) => {
  if (only && only !== name) return;
  const page = await browser.newPage({ reducedMotion: process.argv.includes("--motion") ? "no-preference" : "reduce" });
  page.setDefaultTimeout(5_000);
  page.on("pageerror", (error) => errors.push(error.message));
  try { await run(page); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`); }
  finally { await page.close(); }
};
const start = async (page, query = "") => {
  await page.goto(`${url}/fixture${query}`);
  await page.getByRole("button", { name: "Allow connection", exact: true }).waitFor();
  assert.equal(await page.getByRole("switch").count(), 0, "pairing has no Cloud switch");
  assert.equal(await page.getByRole("checkbox").count(), 0, "pairing has no project selection");
  if (shots) await page.screenshot({ path: "/private/tmp/vibyra-phone-name-request.png" });
};
const connect = async (page, name = "Phone first") => {
  await page.getByRole("button", { name: "Allow connection", exact: true }).click();
  await page.getByRole("heading", { name: "Connected", exact: true }).waitFor();
  assert.equal(await page.locator("#phone-connect-name").textContent(), name);
  if (shots) await page.screenshot({ path: "/private/tmp/vibyra-phone-name-connected.png" });
};
const closed = async (page) => {
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator("[inert]").count(), 0);
  assert.equal(await page.evaluate(() => window.fixture.approvalOpen()), false);
};
try {
  await check("new-device", async (page) => {
    await start(page); await connect(page);
    await page.evaluate(() => window.fixture.request("second"));
    await page.locator("#phone-connect-name").filter({ hasText: /^Phone second$/ }).waitFor();
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await closed(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.calls.filter(([c]) => c === "phone_answer").map(([, a]) => a)),
      [{ id: "first", approve: true }, { id: "second", approve: false }]);
  });
  await check("same-device", async (page) => {
    await start(page); await connect(page);
    await page.evaluate(() => window.fixture.request("first"));
    await page.getByRole("heading", { name: "Connect your iPhone?", exact: true }).waitFor();
    await page.keyboard.press("Escape"); await closed(page);
  });
  await check("busy-dismiss", async (page) => {
    await start(page); await connect(page);
    await page.evaluate(() => { window.fixture.reconnect(); window.fixture.busy(); });
    await page.getByRole("button", { name: "Done", exact: true }).click(); await closed(page);
  });
  await check("pairing-has-no-cloud-effects", async (page) => {
    await start(page); await connect(page);
    await page.keyboard.press("Escape"); await closed(page);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(([command]) => command.startsWith("cloud_")).length), 0);
  });
  await check("pending-during-approval", async (page) => {
    await start(page, "?delay");
    await page.getByRole("button", { name: "Allow connection", exact: true }).click();
    await page.evaluate(() => window.fixture.request("second"));
    assert.equal(await page.locator("#phone-connect-name").filter({ hasText: /^Phone first$/ }).isVisible(), true);
    await page.evaluate(() => window.fixture.finishApproval());
    await page.locator("#phone-connect-name").filter({ hasText: /^Phone second$/ }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await page.evaluate(() => window.fixture.finishApproval()); await closed(page);
  });
  await check("same-device-in-answer", async (page) => {
    await start(page, "?repeat");
    await page.getByRole("button", { name: "Allow connection", exact: true }).click();
    await page.getByRole("button", { name: "Deny", exact: true }).click(); await closed(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.calls.filter(([c]) => c === "phone_answer").map(([, a]) => a)),
      [{ id: "first", approve: true }, { id: "first", approve: false }]);
  });
  await check("account-switch", async (page) => {
    await start(page, "?delay");
    await page.getByRole("button", { name: "Allow connection", exact: true }).click();
    await page.evaluate(() => { window.fixture.switchAccount(); window.fixture.finishApproval(); });
    await closed(page);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(([c]) => c === "cloud_sync_connect_mac").length), 0);
  });
  await check("handoff-has-no-cloud-effects", async (page) => {
    await start(page); await connect(page);
    await page.evaluate(() => window.fixture.request("second"));
    await page.locator("#phone-connect-name").filter({ hasText: /^Phone second$/ }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(([command]) => command.startsWith("cloud_")).length), 0);
    assert.equal(await page.getByRole("alert").count(), 0);
    await connect(page, "Phone second");
    await page.getByRole("button", { name: "Done", exact: true }).click(); await closed(page);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally { await browser.close(); server.close(); }
