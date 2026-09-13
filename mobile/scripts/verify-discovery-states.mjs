import assert from 'node:assert/strict';
import { fullyVisible, until } from './ui-test-helpers.mjs';

/** Per-state checks for the nearby-computer screens. Kept beside the harness so
 *  both stay small and either can be read on its own. */
export async function check(page, state, button) {
  const calls = () => page.evaluate(() => window.discoveryCalls);
  const text = value => page.getByText(value, { exact: true }).first().waitFor();
  // The title is one two-line heading with an accented second line, so it is
  // read whole rather than matched line by line.
  // A scripted state can arrive a beat after the screen mounts, so the heading
  // is awaited rather than sampled once.
  const heading = async expected => {
    const header = page.getByRole('heading').first();
    await header.waitFor();
    // A long result list must never push the title out of reach.
    await fullyVisible(header, page, `title for ${state}`);
    const read = () => header.innerText().then(value => value.replace(/\s+/g, ' ').trim());
    await until(async () => (await read()) === expected, `heading "${expected}" for ${state}`, 8000);
  };
  // Nothing technical may reach the screen: no addresses, ports, subnets or
  // counts. This is asserted for every state, then each state is checked.
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /\b\d{1,3}(\.\d{1,3}){3}\b/, `${state} shows an IP address`);
  assert.doesNotMatch(body, /:4318|:4319|localhost|127\.0\.0|subnet|Checked \d+ of/i,
    `${state} shows something only an engineer would recognise`);
  if (state === 'searching') {
    await heading('Looking for your computer');
    // Several links are named, because that is worth knowing. One would not be.
    for (const link of ['Wi-Fi', 'Direct', 'VPN', 'Cellular']) await text(link);
    await page.getByText('Keep Vibyra open on your computer, with iPhone connection turned on.',
      { exact: true }).waitFor();
    assert.equal(await button('Search again').count(), 0, 'A live search offers no restart');
    assert.deepEqual(await calls(), [], 'Searching selects nothing on its own');
  } else if (state === 'sweep') {
    // The sweep is an implementation detail: it drives the dial, not the words.
    await heading('Looking for your computer');
    assert.equal(await page.getByLabel(/^Searching \d+ network/).count(), 0,
      'a single link is not worth naming');
  } else if (state === 'simulator') {
    // Reaching a Mac over loopback is still just looking for your computer.
    await heading('Looking for your computer');
  } else if (state === 'retry') {
    // A later pass is still the same act, described the same way.
    await heading('Looking for your computer');
    assert.equal(await button('Search again').count(), 0, 'a search still running offers no restart');
  } else if (state === 'swept') {
    await heading('No computer found');
    await fullyVisible(button('Search again'), page, 'Restart after a finished sweep');
  } else if (state === 'cellular') {
    // Cellular cannot carry discovery, so it is shown greyed, never implied.
    await heading('Looking for your computer');
    await text('Cellular');
  } else if (state === 'one') {
    await heading('Found Ellis’s Studio');
    await page.getByText('Connecting…', { exact: true }).waitFor();
    await page.waitForFunction(() => window.discoveryCalls.includes('select:Ellis’s Studio'), null,
      { timeout: 4000 });
  } else if (state === 'many') {
    await heading('Choose your computer');
    await page.getByText('3 ready to connect. Choose the computer you want to use.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Connect to Office desktop', exact: true }).waitFor();
    // A computer that has not resolved yet stays announced but unusable, so it
    // is described rather than hidden and a tap cannot start a dead connection.
    const arriving = page.getByRole('button', { name: 'Living room mini, getting ready', exact: true });
    assert.equal(await arriving.getAttribute('aria-disabled'), 'true');
    await text('Getting ready…');
    // A Host too old for code-free pairing is named as such, not left stuck.
    const older = page.getByRole('button', { name: /Attic tower needs a newer version/ });
    assert.equal(await older.getAttribute('aria-disabled'), 'true');
    await text('Update Vibyra on this computer');
    await arriving.click({ force: true });
    await older.click({ force: true });
    await page.waitForTimeout(1600);
    assert.deepEqual(await calls(), [], 'Several computers never auto-connect, resolved or not');
    await page.getByRole('button', { name: 'Connect to Workshop MacBook Pro', exact: true }).click();
    assert.deepEqual(await calls(), ['select:Workshop MacBook Pro']);
  } else if (state === 'empty' || state === 'failed') {
    await heading(state === 'empty' ? 'No computer found' : 'Could not look for computers');
    await fullyVisible(button('Search again'), page, 'Restart after a quiet search');
  } else if (state === 'denied') {
    await heading('Allow local network access');
    await fullyVisible(button('Open Settings'), page, 'Settings route');
  } else if (state === 'unavailable') {
    // Never "get the app": this already is the app.
    await heading('Join a Wi-Fi network');
    assert.doesNotMatch(body, /download|install the (Vibyra )?app|get the app/i,
      'a client inside the app must never be told to get the app');
    // No live indicators at all: nothing may suggest a search is running.
    assert.equal(await page.getByLabel(/^Searching \d+ network/).count(), 0, 'no link chips');
    // Joining a network has to be actionable from here.
    await fullyVisible(button('Search again'), page, 'Retry once a network is joined');
  } else {
    assert.deepEqual(await calls(), ['connect:ws://192.168.1.24:4318'], 'The resolved address is used verbatim');
    await text('Ellis’s Studio');
    assert.equal(await page.getByRole('button', { name: /Ellis’s Studio/ }).count(), 0,
      'The computer being connected to is pinned, not offered for selection again');
    if (state === 'handshake') await text('Connecting to Ellis’s Studio');
    if (state === 'approval') {
      await text('Approve this iPhone');
      await text('Allow this iPhone on Ellis’s Studio');
      await fullyVisible(button('Cancel'), page, 'Cancelling a pending approval');
    }
    if (state === 'connected') {
      await text('Connected');
      await page.waitForFunction(() => window.discoveryCalls.includes('done'), null, { timeout: 4000 });
    }
    if (state === 'refused') {
      await text('Could not connect');
      await page.getByText('Pairing denied or expired', { exact: true }).waitFor();
      await fullyVisible(button('Try again'), page, 'Retry after refusal');
    }
  }
}
