import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright-core";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const main = await readFile(resolve(root, "src/main.tsx"), "utf8");
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)]
  .map(match => `import ${JSON.stringify(resolve(root, "src", match[1]))};`).join("\n");
const bundle = await build({ stdin: { contents: `${styles}\nimport ${JSON.stringify(resolve(root, "tests/signupFixture.tsx"))};`, resolveDir: root }, bundle: true, write: false,
  outfile: '/tmp/signup.js', format: 'iife', jsx: 'automatic', loader: { '.png':'dataurl', '.jpg':'dataurl', '.webp':'dataurl', '.woff2':'dataurl', '.ttf':'dataurl', '.mp4':'dataurl', '.svg':'dataurl' } });
const server = createServer((request, response) => {
  const ext = request.url.split('?')[0].split('.').at(-1);
  const file = bundle.outputFiles.find(f => f.path.endsWith(`.${ext}`));
  response.setHeader('Content-Type', file ? ext === 'js' ? 'text/javascript' : 'text/css' : 'text/html');
  response.end(file?.contents ?? '<meta charset="utf-8"><link rel="stylesheet" href="/signup.css"><div id="root"></div><script src="/signup.js"></script>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = process.env.VIBYRA_WEBKIT
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1328, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "Continue with Apple" }).click();
  assert.deepEqual(await page.evaluate(() => window.signupEvents.at(-1)), ["oauth", "apple", null]);

  await page.getByRole("button", { name: "Create an account" }).click();
  const terms = page.getByRole("checkbox", { name: /I agree to the Terms of Service/ });
  const adult = page.getByRole("checkbox", { name: /I am 18 or older/ });
  const uk = page.getByRole("checkbox", { name: /I currently reside in the United Kingdom/ });
  for (const box of [terms, adult, uk]) assert.equal(await box.isChecked(), false);
  assert.equal(await page.getByRole("button", { name: "Create with Google" }).isDisabled(), true);
  await terms.check(); await adult.check(); await uk.check();
  await page.getByRole("button", { name: "Create with Google" }).click();
  const fields = { termsVersion: "2026-09-28", termsAccepted: true, adultConfirmed: true, countryCode: "GB" };
  assert.deepEqual(await page.evaluate(() => window.signupEvents.at(-1)), ["oauth", "google", fields]);

  await page.getByText("Have a license key?", { exact: true }).click();
  await page.getByLabel("License key").fill("VPRO-fixture-license");
  fields.licenseKey = "VPRO-fixture-license";
  await page.getByRole("button", { name: "Create with Google" }).click();
  assert.deepEqual(await page.evaluate(() => window.signupEvents.at(-1)), ["oauth", "google", fields]);
  await page.getByRole("button", { name: "Create with email" }).click();
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Email address").fill("ada@example.test");
  await page.getByLabel("Password").fill("longenough");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.signupEvents.at(-1)), ["signup", "Ada", "ada@example.test", "longenough", fields]);
  await uk.uncheck();
  assert.equal(await page.getByRole("button", { name: "Create account", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Continue with Apple" }).click();
  assert.deepEqual(await page.evaluate(() => window.signupEvents.at(-1)), ["oauth", "apple", null]);
  await page.setViewportSize({ width: 600, height: 560 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(`PASS ${process.env.VIBYRA_WEBKIT ? "WebKit" : "Chromium"}: desktop login remains one-click; new provider/email accounts require all attestations and send the 2026-09-28 payload.`);
} finally {
  await browser.close();
  server.close();
}
