import assert from 'node:assert/strict';

export async function verifyMirror({ page, frame, send, output, theme }) {
  // A Mac pane keeps the Mac's own grid: shown with one, the terminal *is* that
  // grid, scaled to fit the phone's width, and the Mac is never told a width. A
  // double tap zooms to a readable size the box pans over; the next puts it back.
  const resizesBeforeMirror = (await page.evaluate(() => window.notices.filter(item => item.type === 'resize'))).length;
  await send({ type: 'state', disabled: true, fontSize: 18, grid: { cols: 158, rows: 42 }, theme });
  await frame.waitForFunction(() => document.querySelector('.xterm-rows').children.length === 42);
  const mirrored = () => frame.evaluate(() => {
    const view = document.getElementById('terminal');
    const rows = document.querySelector('.xterm-rows');
    return { cols: Math.round(document.querySelector('.xterm-screen').offsetWidth / (rows.firstElementChild.getBoundingClientRect().width / 158)),
      rows: rows.children.length, scale: new DOMMatrix(getComputedStyle(document.getElementById('stage')).transform).a,
      frameWidth: document.getElementById('frame').offsetWidth, viewWidth: view.clientWidth, scrolls: view.scrollWidth > view.clientWidth + 1,
      fontSize: parseFloat(getComputedStyle(rows).fontSize) };
  });
  const readable = await mirrored();
  assert.equal(readable.scale, 1, 'a desktop opens at readable 13px, not miniature fit-to-width text');
  const surface = await page.locator('iframe').boundingBox();
  const tapAt = (x, y) => page.touchscreen.tap(surface.x + x, surface.y + y);
  // Pan across the actual rows, where xterm normally consumes touchmove.
  const cdp = await page.context().newCDPSession(page);
  const touches = (x, y) => [{ x: surface.x + x, y: surface.y + y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(300, 100) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(100, 100) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await frame.evaluate(() => document.getElementById('terminal').scrollLeft > 100), 'a finger can pan the desktop grid');
  await page.waitForTimeout(450);
  await tapAt(60, 60); await tapAt(60, 60);
  await frame.waitForFunction(() => document.getElementById('frame').offsetWidth <= document.getElementById('terminal').clientWidth);
  const fitted = await mirrored();
  assert.equal(fitted.rows, 42, 'the Mac grid is drawn row for row');
  assert.ok(fitted.scale < 0.5 && fitted.scale > 0.1, `158 columns are scaled to fit a phone, scale ${fitted.scale}`);
  assert.ok(fitted.frameWidth <= fitted.viewWidth && !fitted.scrolls, `fitted, the whole width is on screen: frame ${fitted.frameWidth}px in ${fitted.viewWidth}px`);
  assert.equal(fitted.fontSize, 13, 'the grid is drawn at the default type size and scaled, not re-laid out');
  await output('\x1b[2J\x1b[H' + 'W'.repeat(150) + '\r\nmirrored', true, { cols: 158, rows: 42 });
  await frame.waitForFunction(() => document.body.textContent.includes('mirrored'));
  const wideRow = await frame.evaluate(() => document.querySelector('.xterm-rows > div').textContent.trim().length);
  assert.equal(wideRow, 150, `a 150-cell line stays on one row of the Mac grid, got ${wideRow}`);
  await page.waitForTimeout(400);
  await tapAt(60, 60); await tapAt(60, 60);
  await frame.waitForFunction(() => document.getElementById('frame').offsetWidth > document.getElementById('terminal').clientWidth);
  const zoomed = await mirrored();
  assert.ok(Math.abs(zoomed.scale - 1) < 0.01 && zoomed.scrolls, `a double tap zooms to readable type the box pans over, scale ${zoomed.scale}`);
  await page.waitForTimeout(400);
  await tapAt(60, 60); await tapAt(60, 60);
  await frame.waitForFunction(() => document.getElementById('frame').offsetWidth <= document.getElementById('terminal').clientWidth);
  assert.equal((await page.evaluate(() => window.notices.filter(item => item.type === 'resize'))).length, resizesBeforeMirror,
    'a Mac pane is never told a width by the phone');
  return { surface, fitted, zoomed };
}
