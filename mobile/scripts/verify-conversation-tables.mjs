import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { capture } from './ui-test-helpers.mjs';
const out = '/tmp/vibyra-conversation-tables';
await mkdir(out, { recursive: true });
const fixture = await serveFixture('tests/conversationTableBrowserFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const width of [320, 375, 430, 844]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 932 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}`);
    const table = page.getByTestId('conversation-table'); await table.waitFor();
    assert.equal(await table.getByTestId('table-row').count(), 7);
    const headers = await table.getByTestId('table-header').locator('[data-testid^="table-cell-"]').all();
    for (let column = 0; column < headers.length; column++) {
      const head = await headers[column].boundingBox();
      const cells = await table.getByTestId('table-row').getByTestId(`table-cell-${column}`).all();
      for (const cell of cells) {
        const box = await cell.boundingBox();
        assert.ok(Math.abs(box.x - head.x) < 1 && Math.abs(box.width - head.width) < 1, 'Headers and body stay aligned');
      }
    }
    const bounds = await table.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Table stays inside the phone');
    await capture(page, `${out}/${width}-${theme}.png`);
    const beforeStream = await headers[0].boundingBox();
    await page.getByRole('button', { name: 'Stream row', exact: true }).click();
    assert.equal(await table.count(), 1); assert.equal(await table.getByTestId('table-row').count(), 7);
    assert.ok(Math.abs((await headers[0].boundingBox()).width - beforeStream.width) < 1, 'Streaming keeps the column width stable');
    await page.getByRole('button', { name: 'Stream row', exact: true }).click();
    await page.getByRole('button', { name: 'Wide table', exact: true }).click();
    await page.getByRole('link', { name: 'Docs' }).waitFor();
    await page.getByText('a | b', { exact: true }).waitFor();
    if (width < 600) {
      const scroll = page.getByLabel('Table, scroll horizontally for more columns');
      await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth; });
      assert.ok(await scroll.evaluate(node => node.scrollLeft > 0), 'Wide tables scroll horizontally');
    }
    await capture(page, `${out}/${width}-${theme}-wide.png`);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${width}/${theme}: exact table, alignment, wrapping, streaming, wide scroll, inline code and links`);
  }
} finally { await browser?.close(); fixture.close(); }
