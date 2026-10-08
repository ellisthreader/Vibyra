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
  // Two painted frames. A screenshot taken in the same tick as the change that
  // opened a sheet returns the frame before it, so the artifact a person reviews
  // shows the screen the assertions above have just walked past.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
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

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Open a session from the rail, which has two faces: the projects on its home
 *  face, and a project's terminals on the face its row swaps to. A session row
 *  reads "<title>, <agent>, <state>" (src/ui/ProjectTerminalRow.tsx). */
export async function openSession(page, name, project) {
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  // The rail's rows arrive with its entrance; count them only once it is open.
  await page.getByRole('button', { name: 'Close navigation menu', exact: true }).waitFor();
  await page.waitForTimeout(400);
  const row = page.getByRole('button', { name: new RegExp(`^${escape(name)}, `) }).first();
  if (!(await row.count())) {
    const back = page.getByRole('button', { name: 'Back to projects', exact: true });
    if (await back.count()) await back.click();
    await page.getByRole('button', { name: new RegExp(`^${escape(project)}, `) }).first().click();
  }
  await row.click();
}
