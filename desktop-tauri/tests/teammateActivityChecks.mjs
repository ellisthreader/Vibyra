import assert from 'node:assert/strict';

const VALID = 'https://github.com/acme/site/issues/41';

/** Mac Agent v2 Phase 8: the activity feed (filters, cursor paging, safe links) and starter teammates. */
export async function checkDesktopActivity({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', () => errors.push('native dialog'));
    const button = name => page.getByRole('button', { name, exact: true });
    const fx = () => page.evaluate(() => window.fixture.inspect().overview);
    await page.goto(`${url}/?v2&grants&${theme}`);
    await button('Activity').click(); await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    const rows = page.locator('.teammate-activity-row');
    await rows.nth(29).waitFor(); assert.equal(await rows.count(), 30);
    assert.match((await fx()).activityPages[0], /^activity\?limit=30$/);
    await page.getByText('Just now').first().waitFor();
    await page.screenshot({ path: `${out}/${kind}-${theme}-activity.png` });
    // Cursor paging: one more page, no duplicates.
    await button('Load more').click(); await rows.nth(44).waitFor();
    assert.equal(await rows.count(), 45); assert.equal(await button('Load more').count(), 0);
    assert.match((await fx()).activityPages.at(-1), /^activity\?limit=30&cursor=PAGE2$/);
    // Service-supplied text is only text; only a validated provider link becomes a button.
    await page.getByText('<img src=x onerror="window.__xss=1"> Posted to #general', { exact: true }).waitFor();
    assert.equal(await page.locator('.teammate-activity-list img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('.teammate-activity-list a').count(), 0, 'no anchors to untrusted strings');
    const links = page.locator('.teammate-activity-link');
    assert.equal(await links.count(), 11, 'an off-host or javascript: URL is not a link');
    await links.first().click();
    assert.deepEqual((await fx()).opened.filter(u => !u.startsWith('about:')), [VALID]);
    // Filters: service chip and teammate, each a server query.
    await page.getByRole('group', { name: 'Filter by service' }).getByRole('button', { name: 'GitHub', exact: true }).click();
    await page.waitForFunction(() => window.fixture.inspect().overview.activityPages.at(-1).includes('provider=github'));
    await page.waitForFunction(() => [...document.querySelectorAll('.teammate-activity-main')].every(el => el.getAttribute('aria-label').startsWith('GitHub')));
    await page.getByLabel('Filter by teammate', { exact: true }).selectOption({ label: 'On-call engineer' });
    await page.waitForFunction(() => /provider=github&agentId=123e4567-e89b-42d3-a456-000000000002$/.test(window.fixture.inspect().overview.activityPages.at(-1)));
    await page.screenshot({ path: `${out}/${kind}-${theme}-activity-filtered.png` });
    await page.getByRole('button', { name: 'All services', exact: true }).click();
    await page.getByLabel('Filter by teammate', { exact: true }).selectOption({ label: 'Website reviewer' });
    for (const width of [700, 390]) {
      await page.setViewportSize({ width, height: 760 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width}`);
      await page.screenshot({ path: `${out}/${kind}-${theme}-activity-${width}.png` });
    }
    await page.setViewportSize({ width: 700, height: 760 });
    await button('Back to teammates').click(); await page.getByLabel('Search teammates', { exact: true }).waitFor();
    await button('Activity').click(); await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByLabel('Filter by teammate', { exact: true }).selectOption({ label: 'Website reviewer' });
    await page.waitForFunction(() => window.fixture.inspect().overview.activityPages.at(-1).includes('agentId='));
    // A row opens that teammate's conversation.
    await page.locator('.teammate-activity-main').first().click();
    await page.getByRole('region', { name: 'Conversation with Website reviewer' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Activity', exact: true }).count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  await checkTemplates({ browser, url, out, kind });
}

async function checkTemplates({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const fx = () => page.evaluate(() => window.fixture.inspect());
    await page.goto(`${url}/?v2&grants&${theme}`);
    await page.getByRole('complementary', { name: 'Teammates navigation' }).getByRole('button', { name: 'New teammate', exact: true }).click();
    await page.getByRole('heading', { name: 'Start from a template', exact: true }).waitFor();
    for (const name of ['Inbox triage', 'PR shepherd', 'Morning brief', 'Meeting prep']) await button(`Create ${name}`).waitFor();
    await page.screenshot({ path: `${out}/${kind}-${theme}-templates.png` });
    // A create that could not be confirmed retries with the same id, so one teammate exists.
    await page.evaluate(() => { window.fixture.overview.failCreateOnce = true; });
    await button('Create Morning brief').click(); await page.getByText('Connection interrupted. Refresh to check the outcome.').waitFor();
    await button('Create Morning brief').click();
    await page.getByRole('region', { name: 'Suggested by Morning brief' }).waitFor();
    const { overview } = await fx();
    assert.equal(overview.createAttempts.length, 2); assert.equal(overview.createAttempts[0].id, overview.createAttempts[1].id);
    assert.equal(overview.created.length, 1);
    assert.equal(await page.getByRole('tab', { name: 'Access', selected: true }).count(), 1, 'setup opens on Access');
    assert.equal(await page.locator('.teammate-accounts input[type=checkbox]:checked').count(), 0, 'nothing is ticked for the person');
    await page.locator('.teammate-tag').first().waitFor();
    // The suggested routine opens the real editor, filled in; nothing is saved by it.
    await page.getByRole('region', { name: 'Suggested by Morning brief' }).screenshot({ path: `${out}/${kind}-${theme}-suggestions-card.png` });
    await button('Set up routine…').click();
    assert.equal(await page.getByRole('textbox', { name: 'Routine instructions', exact: true }).inputValue(), 'Write my morning brief for today.');
    assert.equal(await page.getByRole('radio', { name: 'Weekly', exact: true }).getAttribute('aria-checked'), 'true');
    for (const day of ['Monday', 'Friday']) assert.equal(await page.getByRole('button', { name: day, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Saturday', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByLabel('Time', { exact: true }).inputValue(), '08:00');
    assert.equal((await fx()).routines.schedules.length, 0, 'never auto-scheduled');
    await page.screenshot({ path: `${out}/${kind}-${theme}-suggestions.png`, fullPage: true });
    await button('Dismiss suggestions').click();
    await page.getByRole('region', { name: 'Suggested by Morning brief' }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('agent-template.')).length), 0);
    // PR shepherd: connect its service from the card; its trigger opens seeded, unsaved.
    await button('Back to teammates').first().click();
    await page.getByRole('complementary', { name: 'Teammates navigation' }).getByRole('button', { name: 'New teammate', exact: true }).click();
    await button('Create PR shepherd').click();
    const region = page.getByRole('region', { name: 'Suggested by PR shepherd' }); await region.waitFor();
    await region.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await region.getByText('Connected', { exact: true }).waitFor();
    assert.equal((await fx()).hub.calls.find(c => c.action === 'v2-connection-start')?.provider, 'github');
    assert.equal(await page.locator('.teammate-accounts input[type=checkbox]:checked').count(), 0, 'connecting a suggested service ticks nothing');
    await button('Set up trigger…').click();
    assert.equal(await page.getByRole('radio', { name: 'GitHub pull request', exact: true }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByRole('textbox', { name: 'Trigger instructions', exact: true }).inputValue(), 'A pull request was opened. Summarize it and list anything blocking review.');
    assert.equal((await fx()).routines.triggers.length, 0, 'never auto-subscribed');
    assert.deepEqual(errors, []); await page.close();
  }
}
