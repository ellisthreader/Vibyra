import assert from 'node:assert/strict';

// The model picker and the effort selector, checked apart from the wallet and
// composer flow so `verify-vibes-ui.mjs` stays inside the 200-line source gate.

/** Every company, in a deliberate order, with one card per maker. */
export async function checkPicker(page, capture, out, label) {
  await page.getByRole('button', { name: 'Choose AI model' }).click();
  // Counts are scoped to this sheet: other radios exist elsewhere on the page,
  // and a page-wide count would break the moment one is added.
  const picker = page.getByRole('dialog', { name: 'Choose your AI' });
  // Companies are collapsed, so Auto is the only choice on screen until one opens.
  assert.equal(await picker.getByRole('radio').count(), 1);
  // The companies people look for lead, in that order, and two Meta slugs
  // collapse into a single card.
  const companies = await picker.locator('[aria-expanded]').evaluateAll(
    nodes => nodes.map(node => node.getAttribute('aria-label')));
  assert.deepEqual(companies.slice(0, 4), ['OpenAI', 'Anthropic', 'Google', 'xAI'], 'Ranked companies lead');
  assert.equal(companies.filter(company => company === 'Meta').length, 1, 'One maker is one company');
  assert.ok(companies.length >= 8, `Every company is offered, saw ${companies.length}`);
  await capture(page, `${out}/${label}-models.png`);
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'OpenAI', exact: true }).getAttribute('aria-expanded'), 'true');
  // A model released days ago is badged; one released months ago is not.
  await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).waitFor();
  // The row carries a name, a short summary and a lock — not the effort ladder,
  // which has its own control beside the composer.
  assert.equal(await picker.getByText(/thinking levels/).count(), 0,
    'The picker does not repeat the effort control');
  await picker.getByText('GPT-5.6 Luna on OpenRouter.', { exact: true }).waitFor();
  await capture(page, `${out}/${label}-models-open.png`);
  await page.getByRole('textbox', { name: 'Search AI models' }).fill('grok');
  const found = await picker.getByRole('radio').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
  assert.ok(found.length >= 1 && found.every(name => /grok/i.test(name)), `Search narrows to Grok, saw ${found}`);
  await page.getByRole('textbox', { name: 'Search AI models' }).fill('');
  await page.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).click();
}

/** Exactly the levels the chosen model publishes, and a price that keeps up. */
export async function checkEffort(page, capture, out, label) {
  const picker = page.getByRole('dialog', { name: 'Choose your AI' });

  // The effort selector: only the levels this model publishes, and the price
  // moves with the level rather than lagging a step behind it.
  // The chip opens on the level the model itself publishes as its default.
  await page.getByRole('button', { name: 'Thinking effort, High' }).click();
  const efforts = page.getByRole('dialog', { name: 'Thinking effort' });
  // The sheet slides in, so wait for a row to actually be on screen before the
  // screenshot; the DOM has it a frame before the viewport does.
  await efforts.getByRole('radio', { name: 'Max, Deepest single answer' }).waitFor({ state: 'visible' });
  assert.deepEqual(await efforts.getByRole('radio').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label'))),
    ['None, Reasoning off', 'Low, Fastest', 'Medium, Balanced', 'High, Deep reasoning',
      'X-high, Longer, harder problems', 'Max, Deepest single answer'], 'Exactly the model\u2019s own ladder');
  await capture(page, `${out}/${label}-effort.png`);
  await efforts.getByRole('radio', { name: 'Max, Deepest single answer' }).click();
  await page.getByRole('button', { name: 'Thinking effort, Max' }).waitFor();
  // A raised effort must re-price before it can be sent, never spend at the old quote.
  await page.getByText('This reply uses up to 3 Vibes', { exact: true }).waitFor();
  await capture(page, `${out}/${label}-effort-chosen.png`);
  // A model with no published ladder offers no control at all.
  await page.getByRole('button', { name: 'Choose AI model' }).click();
  await page.getByRole('button', { name: 'Qwen', exact: true }).click();
  await picker.getByRole('radio', { name: 'Qwen3.8 Flash' }).click();
  await page.getByRole('button', { name: 'Choose AI model' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Thinking effort/ }).count(), 0,
    'A model that cannot be steered shows no effort control');
  await page.getByRole('button', { name: 'Choose AI model' }).click();
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
  await picker.getByRole('radio', { name: 'GPT-5.6 Luna, new' }).click();
  // Coming back, the level is the model's own default again rather than a level
  // carried over from a model that never offered it - and the price says so.
  await page.getByRole('button', { name: 'Thinking effort, High' }).waitFor();
  await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
  // Send at Max, so the assertion below proves the sent level, not just the label.
  await page.getByRole('button', { name: 'Thinking effort, High' }).click();
  await page.getByRole('dialog', { name: 'Thinking effort' }).getByRole('radio', { name: 'Max, Deepest single answer' }).click();
  await page.getByText('This reply uses up to 3 Vibes', { exact: true }).waitFor();
}
