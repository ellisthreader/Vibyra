import assert from 'node:assert/strict';

export async function verifyStandaloneWelcome({ browser, server }) {
  const preview = await browser.newPage();
  await preview.goto(`http://127.0.0.1:${server.address().port}/`);
  await preview.getByRole('dialog').waitFor();
  assert.equal(await preview.getByRole('dialog').getAttribute('data-playing'), 'true', 'standalone preview plays on load');
  await preview.getByRole('button',{name:'4. iPhone & Remote',exact:true}).click();
  await preview.waitForFunction(() => document.querySelector('video')?.currentTime > .4);
  await preview.getByRole('button',{name:'Pause introduction'}).click();
  await new Promise(r => setTimeout(r,300));
  const stopped = await preview.locator('video').evaluate(v => v.currentTime);
  await new Promise(r => setTimeout(r,500));
  assert.ok(Math.abs(await preview.locator('video').evaluate(v => v.currentTime) - stopped) < .03, 'phone recording pauses too');
  await preview.close();
}
