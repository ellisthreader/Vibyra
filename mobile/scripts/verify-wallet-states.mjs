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
  await page.getByRole('heading', { name: 'Get more each month', exact: true }).waitFor();
  await page.getByText('You are on the Builder plan with 1,240 Vibes.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('radio').count(), 1, 'only Pro is left above Builder');
  // One offer is not a choice, so it must not take a choice's full width.
  const lone = page.getByRole('radio', { name: 'Pro, 2000 Vibes a month', checked: true });
  await lone.waitFor();
  assert.ok((await lone.boundingBox()).width <= 200, 'a lone offer keeps one card\'s width');
  await page.getByRole('button', { name: 'Upgrade to Pro · £99.00', exact: true }).waitFor();
  await capture(page, `${out}/held-upgrade.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS held: the balance says what is held, and one upgrade needs no picker.');
}

/** A runtime with no StoreKit bridge. Plans stay readable; nothing is buyable. */
export async function checkNoStore(open, capture, out) {
  const { page, errors } = await open('bridge=off');
  const unavailable = 'Purchases are available in the installed iPhone app. Your balance stays with your account.';
  await page.getByText(unavailable).waitFor();
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByText(unavailable).waitFor();
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
  await page.getByRole('button', { name: 'Upgrade to Pro · £99.00' }).waitFor();
  await page.getByRole('radio', { name: 'Starter, 350 Vibes a month' }).click();
  const faded = await sample(page, '[data-testid="bullet"]', 800, node => Number(getComputedStyle(node).opacity));
  assert.ok(faded.some(o => o < 0.9), 'the replaced lines arrive rather than appearing finished');
  assert.equal(faded.at(-1), 1, 'and they finish fully legible');
  await page.getByRole('radio', { name: 'Pro, 2000 Vibes a month' }).click();
  await page.waitForTimeout(400);
  await capture(page, `${out}/motion.png`);
  // Vibes arriving is the one thing in this area worth watching, so the figure on
  // the page the purchase hands back to counts rather than jumping.
  await page.getByRole('button', { name: 'Upgrade to Pro · £99.00' }).click();
  const counted = await sample(page, '[data-testid="balance"]', 1600, node => node.textContent);
  // The trial the fixture holds plus what the Pro product grants, written as the
  // sum so that retuning the trial moves one number here rather than two literals
  // that quietly stop describing the same wallet.
  const arrived = (3 + 2000).toLocaleString();
  assert.ok(counted.some(value => value !== '3' && value !== arrived), 'the balance counts to its new figure');
  assert.equal(counted.at(-1), arrived, 'and it lands on the balance the wallet reports');
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS motion: the lines arrive in order and the balance counts up to what was bought.');
}

/** Backing out of Apple must leave the upgrade page exactly as it was. */
export async function checkCancelled(open) {
  const { page, errors } = await open('purchase=cancel');
  await page.getByRole('button', { name: 'Upgrade your plan' }).click();
  await page.getByRole('button', { name: 'Upgrade to Pro · £99.00' }).click();
  await page.waitForTimeout(400);
  assert.deepEqual((await page.evaluate(() => window.walletCalls)).filter(c => c !== 'wallet'), ['buy']);
  assert.equal(await page.getByRole('alert').count(), 0, 'a cancelled purchase says nothing at all');
  await page.getByRole('radio', { name: 'Pro, 2000 Vibes a month', checked: true }).waitFor();
  // And it must not be mistaken for a finished one and hand the page back.
  await page.getByRole('heading', { name: 'Get more each month', exact: true }).waitFor();
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
  // The wait is a duration, not a clock time: the backend does not know the
  // phone's timezone, and the wrong one is worse than no answer.
  await page.getByText(/^Frees up in about \d+ hours?$/).waitFor();
  // The other window is not full and must not borrow the alarm.
  await page.getByText('360 of 1,000', { exact: true }).waitFor();
  await capture(page, `${out}/spent.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS spent: a full window says so and says when it frees up.');
}

/**
 * A window part-way through, which is the state most accounts are in and the one
 * the page is actually read in. It is also the only place the "frees up" line can
 * be proven: it used to appear only once a window hit zero, so the one fact people
 * came looking for — when does this come back — arrived too late to plan around.
 */
export async function checkPartial(open, capture, out) {
  const { page, errors } = await open('plan=pro&used=150');
  await page.getByText('Next 5 hours', { exact: true }).waitFor();
  await page.getByText('250 of 400', { exact: true }).waitFor();
  await page.getByText('850 of 1,000', { exact: true }).waitFor();
  // Both windows say when they come back, while both still have room left.
  assert.equal(await page.getByText(/^Frees up in about /).count(), 2,
    'a window says when it frees up while there is still time to act on it');
  await page.getByText(/^Frees up in about \d+ hours$/).waitFor();
  await page.getByText(/^Frees up in about \d+ days$/).waitFor();
  await capture(page, `${out}/partial.png`);
  assert.deepEqual(errors, []); await page.close();
  console.log('PASS partial: a part-used window says how much is left and when it returns.');
}

/** Reads one property off an element every frame for `ms`. */
function sample(page, selector, ms, read) {
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
