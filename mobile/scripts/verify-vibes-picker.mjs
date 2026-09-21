import assert from 'node:assert/strict';

// The model picker and the effort selector, checked apart from the wallet and
// composer flow so `verify-vibes-ui.mjs` stays inside the 200-line source gate.

/**
 * Slides the effort thumb from where it rests to `to`, a fraction of the track from
 * the cheapest end. A real press, move and release, so the drag itself is proven.
 */
async function slideEffort(page, to) {
  const track = page.getByRole('slider', { name: 'Thinking effort' });
  await track.waitFor({ state: 'visible' });
  const box = await track.boundingBox();
  const now = Number(await track.getAttribute('aria-valuenow')), max = Number(await track.getAttribute('aria-valuemax'));
  const x = fraction => box.x + 13 + fraction * (box.width - 26), y = box.y + box.height / 2;
  await page.mouse.move(x(now / max), y); await page.mouse.down();
  await page.mouse.move(x(to), y, { steps: 12 }); await page.mouse.up();
  return track;
}

export async function chooseCompany(page, name) {
  const picker = page.getByRole('region', { name: 'Choose your AI' });
  for (let n = 0; n < 10; n++) {
    const company = picker.getByRole('button', { name, exact: true });
    if (await company.count()) { await company.click(); return; }
    await picker.getByRole('button', { name: 'Next companies', exact: true }).click();
  }
  throw new Error(`Company not reachable: ${name}`);
}

/** Company first, then only that company's models, in the composer. */
export async function checkPicker(page, capture, out, label) {
  // On Auto the router owns the level, so the panel says so rather than offering a
  // slider that would do nothing, and the way to take control is the picker.
  await page.getByRole('button', { name: 'Thinking effort, Auto, chosen automatically' }).click();
  await page.getByText('Auto sets the effort for each message.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Message Vibyra AI' }).count(), 0, 'The panel takes the whole composer');
  await capture(page, `${out}/${label}-effort-auto.png`);
  await page.getByRole('button', { name: 'Choose a model to set the effort' }).click();
  // Counts are scoped to this sheet: other radios exist elsewhere on the page,
  // and a page-wide count would break the moment one is added.
  const picker = page.getByRole('region', { name: 'Choose your AI' });
  // Companies are collapsed, so Auto is the only choice on screen until one opens.
  await picker.waitFor();
  assert.equal(await picker.getByRole('radio').count(), 1);
  // The companies people look for lead, in that order, and two Meta slugs
  // collapse into a single card.
  for (const name of ['OpenAI', 'Anthropic', 'Google', 'xAI']) await picker.getByRole('button', { name, exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'The picker stays inside the composer');
  await capture(page, `${out}/${label}-models.png`);
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
  await picker.getByRole('heading', { name: 'OpenAI', exact: true }).waitFor();
  assert.equal(await picker.getByRole('button', { name: 'Anthropic', exact: true }).count(), 0);
  // A model released days ago is badged; one released months ago is not.
  await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).waitFor();
  // The row carries a name, a short summary and a lock — not the effort ladder,
  // which has its own control beside the composer.
  assert.equal(await picker.getByText(/thinking levels/).count(), 0,
    'The picker does not repeat the effort control');
  await capture(page, `${out}/${label}-models-open.png`);
  await picker.getByRole('button', { name: 'Back to companies' }).click();
  await picker.getByRole('button', { name: 'Search AI models' }).click();
  await picker.getByRole('textbox', { name: 'Search AI models' }).fill('grok');
  await picker.getByRole('button', { name: 'xAI', exact: true }).click();
  const found = await picker.getByRole('radio').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
  assert.ok(found.length >= 1 && found.every(name => /grok/i.test(name)), `Search narrows to Grok, saw ${found}`);
  await picker.getByRole('button', { name: 'Back to companies' }).click();
  await picker.getByRole('button', { name: 'Hide model search' }).click();
  await chooseCompany(page, 'OpenAI');
  await page.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).click();
}

/** Exactly the levels the chosen model publishes, and a price that keeps up. */
export async function checkEffort(page, capture, out, label) {
  const picker = page.getByRole('region', { name: 'Choose your AI' });

  // The effort gauge: only the levels this model publishes, and the price moves
  // with the level rather than lagging a step behind it. The chip opens on the
  // level the model itself publishes as its default.
  await page.getByRole('button', { name: 'Thinking effort, High' }).click();
  const track = page.getByRole('slider', { name: 'Thinking effort' });
  await track.waitFor({ state: 'visible' });
  // Six stops, and the two ends are the model's own cheapest and deepest levels.
  assert.equal(await track.getAttribute('aria-valuemax'), '5', 'Exactly the model\u2019s own ladder');
  assert.equal(await track.getAttribute('aria-valuetext'), 'High, Deep reasoning');
  await slideEffort(page, 0);
  assert.equal(await track.getAttribute('aria-valuetext'), 'None, Reasoning off');
  // Sliding right raises it, and the level it reached is named at the top of the panel.
  await slideEffort(page, 1);
  assert.equal(await track.getAttribute('aria-valuetext'), 'Max, Deepest single answer');
  await page.getByRole('heading', { name: 'Max', exact: true }).waitFor();
  assert.equal(await page.getByText(/^(Faster|Deeper)$/).count(), 0, 'The track is not captioned at its ends');
  await capture(page, `${out}/${label}-effort.png`);
  // Done hands the box back to the message, and the chip now holds the level.
  await page.getByRole('button', { name: 'Done setting thinking effort' }).click();
  await track.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Thinking effort, Max' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Message Vibyra AI' }).count(), 1, 'The message box is back');
  // A raised effort must re-price before it can be sent, never spend at the old quote.
  await page.getByText('This reply uses up to 3 Vibes', { exact: true }).waitFor();
  await capture(page, `${out}/${label}-effort-chosen.png`);
  // A model with no published ladder offers no control at all.
  await page.getByRole('button', { name: 'Choose AI model' }).click();
  await chooseCompany(page, 'Qwen');
  await picker.getByRole('radio', { name: 'Qwen3.8 Flash' }).click();
  await page.getByRole('button', { name: 'Choose AI model' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Thinking effort/ }).count(), 0,
    'A model that cannot be steered shows no effort control');
  assert.equal(await page.getByText('Fixed', { exact: true }).count(), 0, 'Non-adjustable effort adds no status label');
  await capture(page, `${out}/${label}-no-effort.png`);
  await page.getByRole('button', { name: 'Choose AI model' }).click();
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
  await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).click();
  // Coming back, the level is the model's own default again rather than a level
  // carried over from a model that never offered it - and the price says so.
  await page.getByRole('button', { name: 'Thinking effort, High' }).waitFor();
  await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
  // The model's whole name shows beside its company's mark, not cut short by the effort control.
  const name = page.getByRole('button', { name: 'Choose AI model' }).getByText('GPT-5.6 Luna', { exact: true });
  assert.ok(await name.evaluate(el => el.scrollWidth <= el.clientWidth), 'The model name is not truncated');
  // Send at Max, so the assertion below proves the sent level, not just the label.
  await page.getByRole('button', { name: 'Thinking effort, High' }).click();
  await slideEffort(page, 1);
  await page.getByRole('button', { name: 'Done setting thinking effort' }).click();
  await page.getByText('This reply uses up to 3 Vibes', { exact: true }).waitFor();
}
