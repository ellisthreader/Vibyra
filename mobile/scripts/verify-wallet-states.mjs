import assert from 'node:assert/strict';

// The wallet's less common states, checked apart from the two-page flow so
// `verify-wallet-ui.mjs` stays inside the 200-line source gate.

/** A plan already paid for, with Vibes held against replies still running. */
export async function checkHeld(open, capture, out) {
  const { page, errors } = await open('plan=builder&held=45&projects=4');
  await page.getByRole('heading', { name: '1,240 Vibes available', exact: true }).waitFor();
  // The plan is not named here any more; the rail row and the upgrade page carry it.
  assert.equal(await page.getByText('Builder', { exact: true }).count(), 0,
    'the plan is not what qualifies a balance');
  // `held` is the one survivor, because it is why `available` is short of `total`
  // and without it the figure quietly disagrees with the one in the rail. It is
  // named after its reason: "Held" alone invites "held by whom?".
  await page.getByText('45 held while replies finish', { exact: true }).waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 2, 'both windows are shown');
  await page.getByText('Next 5 hours', { exact: true }).waitFor();
  await page.getByText('200 of 200', { exact: true }).waitFor();
  await page.getByText('Next 7 days', { exact: true }).waitFor();
  await page.getByText('500 of 500', { exact: true }).waitFor();
  // A paid account can do both, and the upgrade is the one that leads.
  await page.getByRole('button', { name: 'Upgrade your plan', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add 500 Vibes · £20.00', exact: true }).waitFor();
  await capture(page, `${out}/held-balance.png`);
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  // Pro 10× has only Pro 20× above it: the same headline and price a free account
  // sees, and no switch, because one size is not a choice.
  await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab').count(), 0, 'one size is left, so there is nothing to switch');
  await page.getByText('2,000 Vibes every month', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month', exact: true }).waitFor();
  await capture(page, `${out}/held-upgrade.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS held: the balance says what is held, and Pro 10× is sold Pro 20× alone.');
}

/** A runtime with no StoreKit bridge. Plans stay readable; nothing is buyable. */
export async function checkNoStore(open, capture, out) {
  const { page, errors } = await open('bridge=off');
  const unavailable = 'Purchases are available in the installed iPhone app. Your balance stays with your account.';
  // The balance page says nothing about the store; the upgrade page, where the
  // purchase is, says why it cannot be made here.
  await page.getByRole('button', { name: 'Upgrade your plan' }).waitFor();
  assert.equal(await page.getByText(unavailable).count(), 0, 'the balance page stays bare');
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByText('Available in the installed iPhone app.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Billed through your Apple Account. Renews monthly until cancelled.').count(), 0, 'nothing renews where nothing can be bought');
  await page.getByRole('button', { name: 'Purchases unavailable', exact: true }).waitFor();
  await page.getByText('2,000 Vibes every month', { exact: true }).waitFor();
  await capture(page, `${out}/no-store.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS no store: plans stay readable where they cannot be bought.');
}

/**
 * Motion, with Reduce Motion off. Sampled inside the page, because Playwright's
 * own measurements wait for an element to stop moving, which is what this needs to
 * catch in the act.
 */
export async function checkMotion(browser, url, capture, out) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  // Opening the page is the tap it answers: the mark settles in and the lines
  // arrive in order, both sampled from the moment the page appears.
  const opacity = node => Number(getComputedStyle(node).opacity);
  const [mark, lines] = await Promise.all([sample(page, '[data-testid="pro-art"]', 800, opacity),
    sample(page, '[data-testid="bullet"]', 800, opacity)]);
  for (const [seen, what] of [[mark, 'the mark'], [lines, 'the lines']]) {
    assert.ok(seen.some(o => o < 0.9), `${what} arrive rather than appearing finished`);
    assert.equal(seen.at(-1), 1, `${what} finish fully legible`);
  }
  await capture(page, `${out}/motion.png`);
  // Vibes arriving is the one thing in this area worth watching, so the figure on
  // the page the purchase hands back to counts rather than jumping.
  await page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month' }).click();
  await page.getByRole('heading', { name: 'You’re Pro!', exact: true }).waitFor();
  const confetti = await sample(page, '[data-testid="upgrade-confetti"] > div', 700, node => getComputedStyle(node).transform);
  assert.ok(new Set(confetti).size > 2, 'confetti falls through multiple frames');
  await page.screenshot({ path: `${out}/confetti-motion.png` });
  await page.getByRole('button', { name: 'Let’s build' }).click();
  const counted = await sample(page, '[data-testid="balance"]', 1600, node => node.textContent);
  // The trial the fixture holds plus what the Pro product grants, written as the
  // sum so that retuning the trial moves one number here rather than two literals
  // that quietly stop describing the same wallet.
  const arrived = (3 + 2000).toLocaleString();
  assert.ok(counted.some(value => value !== '3' && value !== arrived), 'the balance counts to its new figure');
  assert.equal(counted.at(-1), arrived, 'and it lands on the balance the wallet reports');
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS motion: the mark and lines arrive on opening, and the balance counts up to what was bought.');
}

/** Backing out of Apple must leave the upgrade page exactly as it was. */
export async function checkCancelled(open) {
  const { page, errors } = await open('purchase=cancel');
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month' }).click();
  await page.waitForTimeout(400);
  assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c !== 'wallet'), ['buy']);
  assert.equal(await page.getByRole('alert').count(), 0, 'a cancelled purchase says nothing at all');
  // And it must not be mistaken for a finished one and hand the page back.
  await page.getByRole('heading', { name: 'Get Vibyra Pro', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month', exact: true }).waitFor();
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS cancelled: backing out of Apple leaves the upgrade page as it was.');
}

/**
 * The reported bug: the rail's "Vibyra tokens" row is not gated on an account, so
 * a guest could reach this page — and met a balance of "—", a red "Sign in to use
 * your Vibes.", rules about an economy they were not in, and a restore with
 * nothing to restore to. Being signed out is a state, not a fault.
 */
export async function checkSignedOut(browser, at, capture, out) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(at(`signedIn=0&theme=${theme}`));
    await page.getByRole('heading', { name: /Vibes are what/ }).waitFor();
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await signIn.waitFor();
    assert.ok((await signIn.boundingBox()).height >= 44, 'the one thing to do is a real tap target');
    // Nothing that needs an account, and nothing invented to stand in for one.
    for (const gone of ['Sign in to use your Vibes.', 'Vibes available', 'Restore Purchases',
      'Upgrade your plan', 'How Vibes work', 'Next 5 hours', '—'])
      assert.equal(await page.getByText(gone, { exact: true }).count(), 0, `${gone} needs an account`);
    assert.equal(await page.getByRole('alert').count(), 0, 'arriving signed out is not an error');
    await signIn.click();
    assert.deepEqual(await page.evaluate(() => window.walletCalls), ['sign-in'], 'and it is the only thing it does');
    await capture(page, `${out}/${theme}-signed-out.png`);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS signed out/${theme}: one thing to say, one thing to do, and no error.`);
  }
}

/** A window with nothing left in it says so, and says when that changes. */
export async function checkSpent(open, capture, out) {
  const { page, errors } = await open('plan=pro&used=full');
  await page.getByText('Next 5 hours', { exact: true }).waitFor();
  await page.getByText('0 of 400', { exact: true }).waitFor();
  // Under a day away, the reset is a countdown rather than a clock time.
  await page.getByText(/^Resets in \d+ hr( \d+ min)?$/).waitFor();
  // The other window is not full and must not borrow the alarm.
  await page.getByText('360 of 1,000', { exact: true }).waitFor();
  await capture(page, `${out}/spent.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS spent: a full window says so and says when it resets.');
}

/**
 * A window part-way through, which is the state most accounts are in and the one
 * the page is actually read in, and where both forms of the reset line show: a
 * countdown for the 5 hours, and the phone's own day and time for the 7 days.
 */
export async function checkPartial(open, capture, out) {
  const { page, errors } = await open('plan=pro&used=150');
  await page.getByText('Next 5 hours', { exact: true }).waitFor();
  await page.getByText('250 of 400', { exact: true }).waitFor();
  await page.getByText('850 of 1,000', { exact: true }).waitFor();
  // Both windows say when they reset, while both still have room left: the 5 hours
  // as a countdown, the 7 days as the phone's own day and time.
  assert.equal(await page.getByText(/^Resets /).count(), 2,
    'a window says when it resets while there is still time to act on it');
  await page.getByText(/^Resets in \d+ hr( \d+ min)?$/).waitFor();
  await page.getByText(/^Resets (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d{2}/).waitFor();
  await capture(page, `${out}/partial.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS partial: a part-used window says how much is left and when it returns.');
}

/** Reads one property off an element every frame for `ms`. */
export function sample(page, selector, ms, read) {
  return page.evaluate(async ([selector, ms, source]) => {
    const read = new Function(`return (${source})`)();
    const seen = []; const started = performance.now();
    while (performance.now() - started < ms) {
      const node = document.querySelector(selector);
      if (node) seen.push(read(node));
      await new Promise(frame => requestAnimationFrame(frame));
    }
    return seen;
  }, [selector, ms, read.toString()]);
}

/** A temporary App Store error can be recovered without leaving the upgrade. */
export async function checkPriceRetry(open) {
  const { page, errors } = await open('prices=retry');
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByRole('button', { name: 'Retry Apple prices' }).click();
  const purchase = page.getByRole('button', { name: 'Get Pro 20× · £99.00 a month' });
  await purchase.waitFor();
  assert.equal(await purchase.isEnabled(), true);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal((await page.evaluate(() => window.walletCalls)).includes('buy'), false);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS Apple price recovery: retry enables checkout without making a purchase.');
}
