import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';

const output = resolve('../output/desktop-report-modal');
await mkdir(output, { recursive: true });
const main = await readFile('../desktop-tauri/src/main.tsx', 'utf8');
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)]
  .map((match) => `import ${JSON.stringify(resolve('../desktop-tauri/src', match[1]))};`)
  .join('\n');
const bundle = await build({
  stdin: {
    contents: `${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/reportModalFixture.tsx'))};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  outfile: '/tmp/report-modal.js',
  format: 'iife',
  jsx: 'automatic',
  define: { global: 'globalThis' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.mp4': 'dataurl' },
});
const js = bundle.outputFiles.find((file) => file.path.endsWith('.js'));
const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'));
await writeFile(`${output}/report-modal.js`, js.contents);
await writeFile(`${output}/report-modal.css`, css.contents);
const server = createServer((request, response) => {
  const file = request.url === '/report-modal.js' ? js : request.url === '/report-modal.css' ? css : null;
  response.setHeader('Content-Type', file ? (file === js ? 'application/javascript' : 'text/css') : 'text/html');
  response.end(file?.text ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/report-modal.css"><div id="root"></div><script src="/report-modal.js"></script>');
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const url = `http://127.0.0.1:${server.address().port}`;

try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch(name === 'chromium'
      ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }
      : { headless: true });
    try {
      for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${url}/?${theme}`);
        const dialog = page.getByRole('dialog', { name: 'Report a problem' });
        await dialog.waitFor();
        assert.ok(await dialog.getByRole('textbox', { name: 'What went wrong?' }).evaluate(
          (element) => element === document.activeElement));
        assert.ok(await dialog.getByRole('textbox', { name: 'What went wrong?' }).isVisible());
        assert.ok(await dialog.getByRole('textbox', { name: 'What happened?' }).isVisible());
        assert.ok(await dialog.getByRole('button', { name: 'Capture screenshot' }).isVisible());
        assert.ok(await dialog.getByRole('button', { name: 'Choose window or area' }).isVisible());
        assert.ok(await dialog.getByText('Example (example@example.test)', { exact: false }).first().isVisible());
        assert.match(await dialog.locator('.report__identity').textContent(), /macOS/);
        assert.equal(await dialog.getByRole('checkbox', { name: /Include device diagnostics/ }).count(), 0);
        assert.match(await dialog.locator('.report__heading').textContent(), /hardware, request IP and available project and graphics details/);
        assert.equal(await dialog.getByRole('combobox', { name: 'Type' }).isVisible(), false);
        await page.screenshot({ path: `${output}/${name}-${theme}-simple.png` });

        await page.evaluate(() => window.attachReportScreenshot());
        await dialog.getByRole('img', { name: 'Screenshot attached to this report' }).waitFor();
        assert.ok(await dialog.getByRole('img', { name: 'Screenshot attached to this report' }).isVisible());
        await dialog.getByRole('button', { name: 'Remove' }).click();
        await dialog.getByRole('button', { name: 'Capture screenshot' }).waitFor();
        assert.ok(await dialog.getByRole('button', { name: 'Capture screenshot' }).isVisible());

        await dialog.getByRole('textbox', { name: 'What went wrong?' }).fill('A terminal goes blank');
        await dialog.getByRole('textbox', { name: 'What happened?' }).fill('It goes blank after resizing.');
        assert.ok(await dialog.getByRole('button', { name: 'Send report' }).isEnabled());
        await dialog.getByText('Add an error or more details').click();
        assert.ok(await dialog.getByRole('combobox', { name: 'Type' }).isVisible());
        await dialog.getByRole('combobox', { name: 'Type' }).selectOption('idea');
        assert.ok(await dialog.getByRole('textbox', { name: "What's your idea?" }).isVisible());
        assert.ok(await dialog.getByRole('textbox', { name: /What would you like/ }).isVisible());
        await dialog.getByRole('combobox', { name: 'Type' }).selectOption('bug');
        assert.equal(await dialog.getByRole('checkbox', { name: /Include recent terminal output/ }).isChecked(), false);
        await dialog.getByText('Review included app details').click();
        assert.ok(await dialog.locator('.report__facts').getByText('0.7.9 (build 9)').isVisible());
        assert.ok(await dialog.locator('.report__facts').getByText('Example (example@example.test)').isVisible());
        await dialog.getByRole('combobox', { name: 'Choose a recent app error' })
          .selectOption('Terminal failed to start: process exited');
        assert.equal(await dialog.getByPlaceholder('Paste an error message').inputValue(),
          'Terminal failed to start: process exited');
        await dialog.locator('.report__body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
        assert.ok(await dialog.getByRole('button', { name: 'Send report' }).isVisible());
        await page.screenshot({ path: `${output}/${name}-${theme}-options.png` });
        assert.deepEqual(errors, [], `${name} ${theme}: no page errors`);
        await page.close();
      }

      const compact = await browser.newPage({ viewport: { width: 900, height: 560 } });
      await compact.goto(`${url}/`);
      const compactDialog = compact.getByRole('dialog', { name: 'Report a problem' });
      await compactDialog.getByText('Add an error or more details').click();
      await compactDialog.locator('.report__body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      assert.ok(await compactDialog.getByRole('textbox', { name: 'Contact for a reply' }).isVisible());
      assert.ok(await compactDialog.getByRole('button', { name: 'Send report' }).isVisible());
      const bounds = await compactDialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
      });
      assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height, `${name}: dialog fits a short window`);
      await compact.screenshot({ path: `${output}/${name}-compact-options.png` });
      await compact.close();
    } finally {
      await browser.close();
    }
  }
  console.log(`Report modal verified in Chromium and WebKit. Screenshots in ${output}`);
} finally {
  server.close();
}
