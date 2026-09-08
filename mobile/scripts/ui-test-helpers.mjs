import assert from 'node:assert/strict';

export async function noTutorialFraming(page) {
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /\b(lessons?|courses?|tutorials?|learning path|start learning)\b/i,
    'The remote workspace must not present itself as a learning app');
}

export async function capture(page, path) {
  await noTutorialFraming(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${path}: horizontal overflow`);
  await page.screenshot({ path });
}

export async function fullyVisible(locator, page, label) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && viewport && box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
  `${label} must be fully visible`);
}

export async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${label}`);
}

export async function terminalText(page, text) {
  const element = await page.locator('iframe[title="Interactive terminal"]').elementHandle();
  assert.ok(element, 'The terminal renderer is mounted');
  const frame = await element.contentFrame();
  assert.ok(frame, 'The terminal renderer has a document');
  await frame.waitForFunction(value => document.body.textContent.includes(value), text);
  return frame;
}
