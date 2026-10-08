import assert from 'node:assert/strict';

export async function verifyFundedChat({ open, ask, settled, calls, theme }) {
  // The obsolete local-key flag is false, while the signed-in service works.
  const { page, errors } = await open(`theme=${theme}&no-key`);
  assert.match(await page.locator('.chat-composer-hint').innerText(), /Vibyra tokens/);
  await ask(page);
  assert.ok((await settled(page)).length > 20);
  assert.equal(await calls(page, 'ai_chat'), 1);
  assert.equal(await page.getByRole('button', { name: 'Start a voice conversation' }).isEnabled(), true);
  assert.doesNotMatch(await page.locator('body').innerText(), /OPENAI_API_KEY|Add your OpenAI API key/);
  assert.deepEqual(errors, []);
  await page.close();

  const { page: empty, errors: emptyErrors } = await open(`theme=${theme}&no-tokens`);
  await ask(empty);
  const alert = empty.getByRole('alert'); await alert.waitFor();
  assert.match(await alert.innerText(), /more Vibyra tokens/);
  assert.equal(await empty.locator('.chat-turn--user').count(), 1);
  await empty.getByRole('button', { name: 'Start a voice conversation' }).click();
  await empty.getByText('You need more Vibyra tokens.', { exact: true }).waitFor();
  assert.equal(await calls(empty, 'voice_start'), 0, 'no microphone opens when the token preflight refuses');
  assert.deepEqual(emptyErrors, []);
  await empty.close();
}
