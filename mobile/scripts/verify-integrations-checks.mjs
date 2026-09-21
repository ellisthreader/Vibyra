import assert from 'node:assert/strict';
import { capture } from './ui-test-helpers.mjs';

/** The integrations that live on the person's Mac, and the composer's @mentions:
 *  the check groups verify-integrations-ui.mjs runs after the provider flows. */
export async function deviceChecks(browser, server, out, calls, noKeyForm) {
  // Obsidian and Railway live on the person's own Mac, not on our server. They are on
  // the same page and drawn by the same row, so what has to be proven is the half that
  // differs: the card sends the person to the Mac rather than to a sign-in, it says so
  // in both themes and at both sizes, and nothing about either of them is ever asked
  // of the server.
  for (const [size, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${server.url}/?theme=${theme}&state=vault`);
      await page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
      // The vault is a folder, not a login, and the row says so in the same words as the card.
      const row = page.getByRole('button', { name: 'Obsidian, connected' });
      await row.waitFor();
      await page.getByRole('button', { name: 'Railway, not connected' }).waitFor();
      await capture(page, `${out}/${size}-${theme}-device-rows.png`);
      await row.click();
      const vault = page.getByRole('dialog', { name: 'Obsidian' });
      await vault.getByRole('heading', { name: 'Obsidian is connected' }).waitFor();
      await vault.getByText('Connected to Notes', { exact: true }).waitFor();
      await vault.getByRole('button', { name: 'Access details' }).click();
      await vault.getByText('What Vibyra can see', { exact: true }).waitFor();
      await vault.getByText(/Other files stay on your Mac/).waitFor();
      await vault.getByText(/Set up and stopped on your Mac/).waitFor();
      assert.equal(await vault.getByText('What Vibyra can change', { exact: true }).count(), 0,
        'A vault is read-only, so the card has no Changes section');
      // A device card grants nothing to a provider, so there is no consent line to agree to.
      assert.equal(await vault.getByRole('link', { name: 'Terms' }).count(), 0);
      await noKeyForm(page);
      await capture(page, `${out}/${size}-${theme}-obsidian-connected.png`);
      await vault.getByRole('button', { name: 'Use it in a chat' }).click();
      assert.ok((await calls(page)).includes('vault-chat:vault'), 'Using a vault starts a chat bound to it');
      assert.ok(!(await calls(page)).some(call => call.startsWith('use:')), 'and never drops an @mention the server would refuse');
      await vault.getByRole('button', { name: 'Done' }).click();
      await vault.waitFor({ state: 'detached' });

      await page.getByRole('button', { name: 'Railway, not connected' }).click();
      const railway = page.getByRole('dialog', { name: 'Railway' });
      await railway.getByRole('heading', { name: 'Connect Railway' }).waitFor();
      await railway.getByText('Sign in to Railway on your Mac', { exact: true }).waitFor();
      await railway.getByText(/run: railway login/).waitFor();
      assert.equal(await railway.getByRole('button', { name: 'Continue to Railway' }).count(), 0,
        'There is no provider page to continue to: the CLI is signed in on the Mac');
      await noKeyForm(page);
      await capture(page, `${out}/${size}-${theme}-railway-mac.png`);
      // Asking again with nothing changed on the Mac leaves the card exactly where it was.
      await railway.getByRole('button', { name: 'Check again' }).click();
      await railway.getByRole('heading', { name: 'Connect Railway' }).waitFor();
      assert.ok((await calls(page)).includes('ask-computer'));
      assert.deepEqual((await calls(page)).filter(call => call === 'catalogue').length > 0, true);
      assert.ok(!(await calls(page)).some(call => call.startsWith('authorize:') || call.startsWith('disconnect:')),
        'The server is never asked about an integration that lives on the Mac');
      assert.deepEqual(errors, []); await page.close();
      console.log(`PASS ${size}/${theme}: Mac-side rows, vault card and Railway card.`);
    }
  }
  {
    // The Mac catching up: the folder is chosen and the CLI signed in while the card is
    // open, so Check again has to turn the card and the row behind it together.
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.url}/?state=novault`);
    await page.getByRole('button', { name: 'Obsidian, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'Obsidian' });
    await sheet.getByRole('heading', { name: 'Connect Obsidian' }).waitFor();
    await sheet.getByText(/Vault folder/).waitFor();
    await capture(page, `${out}/obsidian-no-vault.png`);
    await sheet.getByRole('button', { name: 'Check again' }).click();
    await sheet.getByRole('heading', { name: 'Obsidian is connected' }).waitFor();
    await sheet.getByText('Connected to Notes', { exact: true }).waitFor();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await sheet.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Obsidian, connected' }).waitFor();
    await page.getByRole('button', { name: 'Railway, connected' }).waitFor();
    await page.getByText('Connected as ellis@example.com', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Railway, connected' }).click();
    const railway = page.getByRole('dialog', { name: 'Railway' });
    await railway.getByRole('button', { name: 'Use it in a chat' }).click();
    assert.ok((await calls(page)).includes('vault-chat:railway'), 'Railway starts a chat bound to its read-only tools');
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS novault: Check again turns the card and its row together.');
  }
  {
    // With no computer paired there is nothing to check again, so the card offers the
    // one thing that would help instead.
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=nocomputer`);
    await page.getByRole('button', { name: 'Obsidian, not connected' }).click();
    const sheet = page.getByRole('dialog', { name: 'Obsidian' });
    await sheet.getByText(/Connect your computer first/).waitFor();
    assert.equal(await sheet.getByRole('button', { name: 'Check again' }).count(), 0);
    await capture(page, `${out}/obsidian-no-computer.png`);
    await sheet.getByRole('button', { name: 'Connect your computer' }).click();
    assert.ok((await calls(page)).includes('connect-computer'));
    await page.close();
    console.log('PASS nocomputer: the card asks for the Mac, not for a key.');
  }
}

export async function composerChecks(browser, server, out) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await page.goto(`${server.url}/?state=composer&theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill('@');
    await page.getByRole('button', { name: 'Mention GitHub' }).waitFor();
    const pickerBox = await page.getByRole('button', { name: 'Mention GitHub' }).boundingBox();
    const inputBox = await input.boundingBox();
    assert.ok(pickerBox.y + pickerBox.height <= inputBox.y, 'Picker is above the input');
    await capture(page, `${out}/composer-${theme}-picker.png`);
    await input.fill('what changed this week');
    await input.click(); await input.pressSequentially(' @g');
    await page.getByRole('button', { name: 'Mention GitHub' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Mention / }).count(), 1);
    await page.getByRole('button', { name: 'Mention GitHub' }).click();
    assert.equal(await input.inputValue(), 'what changed this week @github ');
    assert.equal(await input.evaluate(el => el.selectionStart), (await input.inputValue()).length, 'Selection follows inserted mention');
    const mention = page.getByTestId('mention-github');
    await mention.waitFor();
    assert.equal(await mention.evaluate(el => getComputedStyle(el).color), theme === 'dark' ? 'rgb(122, 162, 255)' : 'rgb(36, 91, 214)');
    await capture(page, `${out}/composer-${theme}-blue.png`);
    await input.fill('@ github review this PR');
    await mention.waitFor();
    await input.fill('@s');
    await page.getByRole('button', { name: 'Mention Stripe' }).click();
    assert.equal(await input.inputValue(), '@stripe ');
    const stripeMention = page.getByTestId('mention-stripe');
    assert.equal(await stripeMention.evaluate(el => getComputedStyle(el).color), theme === 'dark' ? 'rgb(122, 162, 255)' : 'rgb(36, 91, 214)');
    await input.fill('@ stripe how much did this project collect this month?');
    await stripeMention.waitFor();
    await capture(page, `${out}/composer-${theme}-stripe.png`);
    for (const [id, name] of [['figma', 'Figma'], ['obsidian', 'Obsidian'], ['railway', 'Railway']]) {
      await input.fill('@' + id.slice(0, 2));
      await page.getByRole('button', { name: `Mention ${name}` }).click();
      assert.equal(await input.inputValue(), `@${id} `);
      await page.getByTestId('mention-' + id).waitFor();
      assert.equal(await input.evaluate(el => el.selectionStart), id.length + 2);
    }
    await input.fill('me@github.com');
    assert.equal(await mention.count(), 0);
    await page.close(); console.log(`PASS composer/${theme}: picker geometry, insertion, blue and spaced mentions, email exclusion.`);
  }
}
