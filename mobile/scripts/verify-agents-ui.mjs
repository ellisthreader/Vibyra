import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
import { checkSetup, setupTeammate } from './agent-setup-checks.mjs';
import { capture, fullyVisible } from './ui-test-helpers.mjs';

const out = '/tmp/vibyra-agents-screenshots'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/agentsBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
const button = name => page.getByRole('button', { name, exact: true });
const input = name => page.getByRole('textbox', { name, exact: true });
const open = async (search = '', width = 375, height = 667) => {
  page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }); page.setDefaultTimeout(12000);
  await page.goto(`${url}/?${search}`); await page.getByRole('tab', { name: 'Agents', exact: true }).click();
};
const setup = (name, job, routine) => setupTeammate(page, name, job, routine);
try {
  for (const theme of ['dark', 'light']) {
    await open(`theme=${theme}`); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await button('Website helper, Needs your approval').waitFor();
    await capture(page, `${out}/${theme}-roster.png`);
    await input('Search teammates').fill('Code reviewer');
    assert.equal(await button('Website helper, Needs your approval').count(), 0);
    await input('Search teammates').fill('');
    await button('Website helper, Needs your approval').click();
    await page.getByText('bakery/website', { exact: false }).waitFor();
    await input('Message Website helper').fill('Keep this teammate draft.');
    await button('Add to chat').click();
    const [file] = await Promise.all([page.waitForEvent('filechooser'), button('Choose files').click()]);
    await file.setFiles({ name: 'teammate-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Keep this attachment with the teammate.') });
    await button('Remove teammate-notes.txt').waitFor();
    await capture(page, `${out}/${theme}-decision.png`);
    await button('Approve once').click();
    await page.getByText('Approved · waiting to run', { exact: true }).waitFor();
    assert.equal(await page.getByText('Action completed', { exact: true }).count(), 0, 'approval is not execution');
    assert.equal((await page.evaluate(() => window.agentCalls)).filter(x => x.action === 'decision').length, 1);
    await button('Back to teammates').click();
    await page.getByRole('tab', { name: 'Code', exact: true }).click();
    await input('Message Vibyra AI').fill('Keep my Work draft.');
    await page.getByRole('tab', { name: 'Agents', exact: true }).click();
    await page.evaluate(() => window.reconnectAgentHost());
    await button('Website helper, Needs your approval').click();
    assert.equal(await input('Message Website helper').inputValue(), 'Keep this teammate draft.');
    await button('Remove teammate-notes.txt').waitFor();
    await button('Back to teammates').click(); await button('Code reviewer, Ready').click();
    assert.equal(await input('Message Code reviewer').inputValue(), '');
    assert.equal(await button('Remove teammate-notes.txt').count(), 0);
    await button('Back to teammates').click(); await button('Website helper, Needs your approval').click();
    await button('Remove teammate-notes.txt').waitFor();
    await button('Back to teammates').click();
    await button('New teammate').click();
    await capture(page, `${out}/${theme}-setup-intro.png`);
    await setup('Research helper', 'Read connected sources and prepare a concise report.', true);

    await page.getByRole('tab', { name: 'Access', exact: true }).click();
    await input('Vibes per task').fill('0'); assert.equal(await button('Create teammate').isDisabled(), true);
    await input('Vibes per task').fill('5');
    await fullyVisible(button('Create teammate'), page, 'create footer');
    await capture(page, `${out}/${theme}-setup.png`);
    await button('Back to teammates').click(); await button('New teammate').click();
    await page.getByRole('tab', { name: 'Profile', exact: true }).click(); assert.equal(await input('Teammate name').inputValue(), 'Research helper');
    await button('Create teammate').click(); await input('Message Research helper').waitFor();
    await input('Message Research helper').fill('Summarize the connected sources.');
    await button('Send message').click(); await page.getByText('Fixture reply only.').waitFor();
    await capture(page, `${out}/${theme}-conversation.png`);
    await button('Teammate details').click(); await input('Teammate task').fill('Review sources and cite each conclusion.');
    await button('Save changes').click(); await input('Message Research helper').waitFor();
    const edits = (await page.evaluate(() => window.agentCalls)).filter(x => x.action === 'save' && x.revision !== undefined);
    assert.equal(edits.length, 1); assert.equal(edits[0].fields.id, undefined); assert.equal(edits[0].revision, 1);
    await button('Teammate details').click(); await button('Archive teammate').click();
    await page.getByText('Archived · restore this teammate to send another task.').waitFor();
    assert.equal(await button('Send message').isDisabled(), true);
    await button('Back to teammates').click(); await page.getByRole('tab', { name: 'Code', exact: true }).click();
    // Disconnect restores the existing Work route, Ideas with its draft; the Agent switch never changes it.
    assert.equal(await input('Message Vibyra AI').inputValue(), 'Keep my Work draft.');
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${theme}: roster, setup/budget, save, scoped send, archive, mode/reconnect/draft continuity, approval receipt.`);
  }
  await open('empty'); await checkSetup(page, out); await page.close();
  await open('empty&save-timeout'); await button('New teammate').click();
  await setup('Retry helper', 'Prepare a report.');
  await button('Create teammate').click(); await button('Retry save').waitFor();
  await button('Back to teammates').click(); await button('New teammate').click();
  await button('Retry save').click(); await input('Message Retry helper').waitFor();
  const saves = (await page.evaluate(() => window.agentCalls)).filter(x => x.action === 'save');
  assert.equal(saves.length, 2); assert.deepEqual(saves[0], saves[1]); await page.close();
  await open('empty&save-timeout'); await button('New teammate').click();
  await setup('Durable helper', 'Keep a report.');
  await button('Create teammate').click(); await button('Retry save').waitFor();
  const original = (await page.evaluate(() => window.agentCalls)).find(x => x.action === 'save');
  await page.reload(); await button('New teammate').click(); await button('Retry save').waitFor();
  assert.equal(await input('Teammate name').inputValue(), 'Durable helper');
  await button('Retry save').click();
  await page.waitForFunction(() => window.agentCalls.some(x => x.action === 'save'));
  const recovered = (await page.evaluate(() => window.agentCalls)).find(x => x.action === 'save');
  assert.equal(JSON.stringify(recovered), JSON.stringify(original), 'cold restart retries the persisted UUID and payload'); await page.close();
  for (const changed of ['changeAgentDecision', 'expireAgentDecision']) {
    await open(); await button('Website helper, Needs your approval').click(); await button('Approve once').waitFor();
    await page.evaluate(name => window[name](), changed); await button('Approve once').click();
    await page.getByText('This action changed or expired. Refresh before deciding.').waitFor();
    assert.equal((await page.evaluate(() => window.agentCalls)).filter(x => x.action === 'decision').length, 0); await page.close();
  }
  await open('decision-timeout'); await button('Website helper, Needs your approval').click(); await button('Deny').click();
  await button('Refresh decision').click(); await page.getByText('Declined', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.agentCalls)).filter(x => x.action === 'decision').length, 1); await page.close();
  await open('paused'); await button('Website helper, Needs your approval').click();
  assert.equal(await button('Approve once').isDisabled(), true); assert.equal(await button('Deny').isDisabled(), true); await page.close();
  await open('signed-out'); await button('Sign in').waitFor(); assert.equal(await button('New teammate').isDisabled(), true); await page.close();
  for (const state of ['demo', 'demo&phone-chat-off', 'demo&signed-out', 'signed-out&phone-chat-off']) {
    await open(state);
    if (state.startsWith('demo')) {
      await button('Website helper, Ready').waitFor(); assert.equal(await button('Sign in').count(), 0);
      await button('Website helper, Ready').click(); await input('Message Website helper').fill('Review the opening hours.');
      await button('Send message').click(); await page.getByText(/This is a sample conversation with Website helper/).waitFor();
      await button('Back to teammates').click(); await button('New teammate').click();
      await setup('Demo helper', 'Prepare a short report.');
      await button('Create teammate').click(); await input('Message Demo helper').waitFor();
      await button('Back to teammates').click();
    } else await button('Sign in').waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Agents', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Code', exact: true }).click();
    await page.getByRole('tab', { name: 'Agents', exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.agentCalls)).length, 0, 'navigation cannot execute a teammate task');
    await capture(page, `${out}/${state.replaceAll('&', '-')}-switch.png`); await page.close();
  }
  for (const [label, width, height] of [['wide', 1366, 900], ['short', 667, 375], ['small', 320, 568]]) {
    await open('theme=light', width, height); await button('New teammate').click();
    await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor(); await fullyVisible(button('Create teammate'), page, `${label} overview footer`);
    await setup('Compact helper', 'Research a topic.');
    await fullyVisible(button('Create teammate'), page, `${label} create footer`);
    const panel = await button('Create teammate').boundingBox();
    assert.ok(Math.abs(panel.x + panel.width / 2 - width / 2) < 2, 'setup is centered in the screen');
    await capture(page, `${out}/${label}-setup.png`);
    for (const section of ['Memory', 'Access', 'Skills', 'Profile']) {
      await page.getByRole('tab', { name: section, exact: true }).click(); await fullyVisible(button('Create teammate'), page, `${label} ${section} footer`);
      assert.equal(await input('Message teammate setup').count(), 0, 'editors have no competing composer');
      await capture(page, `${out}/${label}-${section}.png`);
    }
    await page.close();
  }
  await open(); await button('Website helper, Needs your approval').click(); await input('Message Website helper').fill('Private draft');
  await page.evaluate(() => window.switchAgentAccount()); await page.getByRole('tab', { name: 'Agents', exact: true }).click();
  await button('Sign in').waitFor(); assert.equal(await input('Message Website helper').count(), 0); await page.close();
  console.log('PASS ambiguous save/decision, changed/expired action, disabled history, sign-out isolation. Screenshots:', out);
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: `${out}/failure.png` }); console.error(await page.locator('body').innerText()); }
  throw error;
} finally { await browser.close(); close(); }
