import assert from 'node:assert/strict';

const FIX = 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.';
const agent = '123e4567-e89b-42d3-a456-000000000001';

/** Mac Agent v2 Phase 8: plan card, refusal fix, v2 attachments, per-device roster status and read markers. */
export async function checkDesktopOverview({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', () => errors.push('native dialog'));
    const button = name => page.getByRole('button', { name, exact: true });
    const fx = () => page.evaluate(() => window.fixture.inspect());
    const box = page.getByRole('textbox', { name: 'Message Website reviewer' });
    const card = page.getByRole('region', { name: 'What it will use' });
    await page.goto(`${url}/?v2&grants&${theme}`);
    const row = page.locator('.teammate-row').filter({ hasText: 'Website reviewer' });
    // Roster: status and the approval dot come from GET /roster, with this install's device header.
    await row.getByRole('img', { name: 'Needs your approval' }).waitFor();
    await row.getByText('Needs your approval', { exact: true }).waitFor();
    const roster = (await fx()).overview.calls.find(c => c.path === 'agents/v2/roster');
    assert.match(roster.device, /^mac-[A-Za-z0-9._:-]{1,60}$/, 'roster is asked per install');
    await row.click();
    await page.waitForFunction(() => window.fixture.inspect().overview.reads.length >= 1);
    const read = (await fx()).overview.reads[0];
    assert.deepEqual([read.agent, read.cursor], [agent, 'd'.repeat(64)]);
    assert.equal(read.device, roster.device, 'the same device on both calls');
    assert.equal((await fx()).readCalls, 0, 'a v2 thread never uses the v1 read marker');
    await button('Approve once').click(); await page.getByText('Sent the release notes.', { exact: true }).waitFor();
    // Plan card at the review step; Send stays enabled throughout.
    await box.fill('Draft the weekly summary.'); await box.press('Enter');
    await card.waitFor(); await card.getByText('Can use Gmail · 1 action asks first', { exact: true }).waitFor();
    await card.getByText('Reads: search, read · Asks first: send', { exact: true }).waitFor();
    await card.getByText('1 tool was left out to keep this task under 10 tools. Name a service in your message to bring it in.', { exact: true }).waitFor();
    assert.equal(await button('Send message').isEnabled(), true);
    const sent = (await fx()).overview.previews.at(-1);
    assert.deepEqual([sent.agentId, sent.prompt, sent.attachments], [agent, 'Draft the weekly summary.', []]);
    assert.match(sent.idempotencyKey, /^preview-[A-Za-z0-9._:-]{8,}$/);
    await page.locator('.teammate-compose-area').screenshot({ path: `${out}/${kind}-${theme}-plan-card.png` });
    for (const width of [700, 390]) {
      await page.setViewportSize({ width, height: 760 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width}`);
      await page.locator('.teammate-compose-area').screenshot({ path: `${out}/${kind}-${theme}-plan-card-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await button('Cancel').click(); assert.equal(await card.count(), 0, 'the card leaves with the review');
    // A blocking gap: the fix is one button and Send is still available.
    await box.fill('Open a github issue for the crash.'); await box.press('Enter');
    await card.getByText('Needs setup before it can run', { exact: true }).waitFor();
    await card.getByText('No GitHub account is connected.', { exact: true }).waitFor();
    assert.equal(await button('Send message').isEnabled(), true);
    await page.locator('.teammate-compose-area').screenshot({ path: `${out}/${kind}-${theme}-plan-gap.png` });
    const before = (await fx()).overview.previews.length;
    await button('Connect GitHub').click();
    await page.waitForFunction(n => window.fixture.inspect().overview.previews.length > n, before);
    assert.equal((await fx()).hub.calls.find(c => c.action === 'v2-connection-start')?.provider, 'github');
    await button('Cancel').click();
    // Not allowed yet: the fix opens this teammate's Access tab, where the person chooses.
    await box.fill('Summarise my Gmail, I have no access set.'); await box.press('Enter');
    await card.getByText('Website reviewer has no access to Gmail.', { exact: true }).waitFor();
    await card.getByText('Choose what Website reviewer may do with team@example.com.', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Choose access', exact: true }).click();
    await page.getByRole('tab', { name: 'Access', selected: true }).waitFor();
    await button('Back to teammates').first().click(); await row.click();
    // No AI account: the server's own words and a button to Settings.
    await box.fill('Do this with no AI account.'); await box.press('Enter');
    await card.getByText(FIX, { exact: true }).waitFor(); await card.getByRole('button', { name: 'Open AI accounts', exact: true }).waitFor();
    assert.equal(await button('Send message').isEnabled(), true);
    await button('Cancel').click();
    // A failed preview is one quiet line, never a block.
    await box.fill('Please plan error.'); await box.press('Enter');
    await page.getByText('Couldn’t check what it will use. You can still send.', { exact: true }).waitFor();
    assert.equal(await button('Send message').isEnabled(), true); await button('Cancel').click();
    // A refused send shows the server's fix and keeps the draft.
    await box.fill('Send this anyway.'); await box.press('Enter');
    await page.evaluate(() => { window.fixture.overview.refuseAdmit = true; });
    await button('Send message').click();
    const alert = page.getByRole('alert').filter({ hasText: FIX }); await alert.waitFor();
    await alert.getByRole('button', { name: 'Open AI accounts', exact: true }).waitFor();
    assert.equal(await page.getByText(/^409:/).count(), 0, 'the status prefix never shows');
    assert.equal(await box.inputValue(), 'Send this anyway.');
    await page.locator('.teammate-compose-area').screenshot({ path: `${out}/${kind}-${theme}-runtime-fix.png` });
    // Attachments ride on v2: uploaded first, then named by id in admission.
    await page.getByLabel('Attach file', { exact: true }).setInputFiles({ name: 'tool.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await page.getByText('Attach a photo, a PDF or a text file.', { exact: true }).waitFor();
    assert.equal((await fx()).overview.uploads.length, 0, 'an unsuitable file never leaves the Mac');
    await page.getByLabel('Attach file', { exact: true }).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Test context') });
    await button('Remove notes.txt').waitFor();
    assert.deepEqual((await fx()).overview.uploads, [{ name: 'notes.txt', mime: 'text/plain', bytes: 12 }]);
    await box.press('Enter'); await button('Send message').click();
    await page.getByText('Fixture v2 reply.', { exact: true }).waitFor();
    const admit = (await fx()).v2.admits.at(-1);
    assert.deepEqual([admit.prompt, admit.attachments], ['Send this anyway.', [{ id: '123e4567-e89b-42d3-a456-000000000041' }]]);
    await button('Remove notes.txt').waitFor({ state: 'detached' });
    assert.equal(await page.getByText(/tokens used|Vibyra tokens used/i).count(), 0, 'no token copy on a connected-account task');
    assert.deepEqual(errors, []); await page.close();
  }
  await checkStaleRead({ browser, url });
}

/** A 409 stale_cursor is refresh-and-mark-again, never an error on screen. */
async function checkStaleRead({ browser, url }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?v2&grants&dark`);
  await page.evaluate(() => { window.fixture.overview.staleReads = 1; window.fixture.overview.status = 'completed'; });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const row = page.locator('.teammate-row').filter({ hasText: 'Website reviewer' });
  await row.locator('.teammate-dot').waitFor();
  assert.equal(await row.locator('.teammate-dot.approval').count(), 0, 'finished and unread: the plain dot');
  await row.click();
  await page.waitForFunction(() => window.fixture.inspect().overview.reads.length >= 2);
  const reads = (await page.evaluate(() => window.fixture.inspect())).overview.reads;
  assert.deepEqual(reads.map(r => r.cursor), ['d'.repeat(64), 'e'.repeat(64)], 'marked again with the refreshed cursor');
  await row.locator('.teammate-dot').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []); await page.close();
}
