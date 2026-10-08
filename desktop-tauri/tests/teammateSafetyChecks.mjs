import assert from 'node:assert/strict';

/**
 * Agent v2 security-review copy on the Mac (docs/agent-v2-security-review.md), driven by
 * `mobile/scripts/verify-desktop-teammates.mjs` against the isolated teammates fixture.
 */
const card = async (browser, url, search, size = { width: 1280, height: 800 }) => {
  const page = await browser.newPage({ viewport: size }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?${search}`);
  return { page, errors };
};

/** Browser honesty: the Access tab's browser block says live-connection-only sites do not work there. */
export async function checkDesktopBrowserNote({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const { page, errors } = await card(browser, url, `v2&browser${theme === 'light' ? '&light' : ''}`);
    await page.getByRole('button', { name: /Website reviewer/ }).first().click();
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Access', exact: true }).click();
    const block = page.locator('.teammate-browser-sites');
    await block.getByText('news.example.com', { exact: true }).waitFor();
    await block.getByText('Sites that work only over live connections, like chat apps and some dashboards, don’t work in your teammate’s browser.', { exact: true }).waitFor();
    await block.screenshot({ path: `${out}/${kind}-${theme}-browser-sites.png` });
    assert.deepEqual(errors, []); await page.close();
  }
}

/** F-24: the sign-in card has a fixed heading and quotes the model's reason as plain, capped teammate text. */
export async function checkDesktopTakeover({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const { page, errors } = await card(browser, url, `takeover${theme === 'light' ? '&light' : ''}`);
    const box = page.locator('.browser-takeover');
    await box.waitFor();
    assert.equal(await box.getByRole('heading').innerText(), 'Your teammate is asking you to sign in', 'the heading is the app\'s own words');
    const says = await box.locator('.browser-takeover__says').innerText();
    assert.match(says, /^Your teammate says: “.+”$/s, 'the reason is quoted teammate text');
    const quoted = says.slice('Your teammate says: “'.length, -1);
    assert.ok([...quoted].length <= 160, `the reason is capped at 160 characters, got ${[...quoted].length}`);
    assert.ok(!/["“”]/.test(quoted), 'the reason cannot close its own quote');
    assert.ok(!says.includes('\n'), 'one line');
    assert.equal(await box.locator('b').count(), 0, 'markup in the reason stays literal text');
    assert.match(await box.innerText(), /bank\.example\.com/, 'the site is still named');
    assert.equal(await box.getByRole('button', { name: 'Resume', exact: true }).isVisible(), true);
    await page.screenshot({ path: `${out}/${kind}-${theme}-takeover.png` });
    assert.deepEqual(errors, []); await page.close();
  }
}

/** F-07: the approval card names the account, plus a short connection id when several accounts are granted. */
export async function checkDesktopApprovalAccounts({ browser, url, out, kind }) {
  for (const theme of ['dark', 'light']) {
    const { page, errors } = await card(browser, url, `v2&accounts=two${theme === 'light' ? '&light' : ''}`);
    await page.getByRole('button', { name: /Website reviewer/ }).first().click();
    const source = page.locator('.teammate-decision small').first();
    await source.waitFor();
    // The card reads the teammate's accounts when it appears; the id joins the line once they are known.
    await page.waitForFunction(() => /c001/.test(document.querySelector('.teammate-decision small')?.textContent ?? ''));
    assert.match(await source.innerText(), /^Gmail · team@example\.com · c001 · /, 'two accounts: label and connection id');
    await page.screenshot({ path: `${out}/${kind}-${theme}-approval-two-accounts.png` });
    assert.deepEqual(errors, []); await page.close();
  }
  { // One granted account: the list was read (recorded by the hub fixture), and the line stays the label alone.
    const { page } = await card(browser, url, 'v2&accounts=one');
    await page.getByRole('button', { name: /Website reviewer/ }).first().click();
    const source = page.locator('.teammate-decision small').first();
    await source.waitFor();
    await page.waitForFunction(() => window.fixture.inspect().hub.calls.some(c => c.action === 'v2-connection-list'));
    await page.waitForTimeout(200);
    const text = await source.innerText();
    assert.match(text, /^Gmail · team@example\.com · /);
    assert.doesNotMatch(text, /c001/, 'one account shows its label alone');
    await page.close();
  }
  { // The account list is unreadable: "only one account" is unproven, so the id is shown.
    const { page } = await card(browser, url, 'v2&accounts=fail');
    await page.getByRole('button', { name: /Website reviewer/ }).first().click();
    await page.locator('.teammate-decision small').first().waitFor();
    await page.waitForFunction(() => /c001/.test(document.querySelector('.teammate-decision small')?.textContent ?? ''));
    assert.match(await page.locator('.teammate-decision small').first().innerText(), /team@example\.com · c001/);
    await page.close();
  }
}
