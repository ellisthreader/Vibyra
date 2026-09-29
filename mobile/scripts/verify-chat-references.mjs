import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const server = await serveFixture('tests/chatReferencesBrowserFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const enabled = page => page.waitForFunction(() => document.querySelector('[aria-label="Send message"]') && document.querySelector('[aria-label="Send message"]').getAttribute('aria-disabled') !== 'true');
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 740 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error(e.stack); });
    await page.goto(`${server.url}/?theme=${theme}`);
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    const send = page.getByRole('button', { name: 'Send message' });
    for (const text of ['@github inspect', '@stripe inspect', '@figma inspect', '@github @stripe @figma compare']) {
      await input.fill(text); await enabled(page); await send.click();
      await page.waitForFunction(text => window.referenceCalls.some(c => c.kind === 'send' && c.text === text), text);
      const sent = await page.evaluate(() => window.referenceCalls.filter(c => c.kind === 'send').at(-1));
      assert.deepEqual(sent.integrations, text.match(/@\w+/g).map(x => x.slice(1)));
    }
    for (const [id, name, project] of [['obsidian', 'Obsidian', 'vault'], ['railway', 'Railway', 'rail']]) {
      await input.fill(`@${id} inspect`);
      await page.getByRole('button', { name: `Use ${name} in this chat` }).click();
      assert.equal(await send.isDisabled(), true);
      await page.getByRole('button', { name: 'Use this project', exact: true }).click();
      await page.waitForFunction(project => window.referenceCalls.some(c => c.kind === 'attach' && c.projectId === project), project);
      await enabled(page); await send.click();
      await page.waitForFunction(project => window.referenceCalls.some(c => c.kind === 'send' && c.project === project), project);
      const sent = await page.evaluate(() => window.referenceCalls.filter(c => c.kind === 'send').at(-1));
      assert.deepEqual(sent.integrations, []);
      await page.getByTestId('mention-' + id).waitFor();
    }
    await input.fill('@obsidian @railway compare');
    await page.getByText(/Use Obsidian and Railway in separate messages/).waitFor();
    assert.equal(await send.isDisabled(), true);
    await input.fill('@railway keep this draft');
    await page.getByRole('button', { name: 'Fixture offline' }).click();
    await page.getByText(/Connect Railway in Integrations/).waitFor();
    assert.equal(await send.isDisabled(), true);
    assert.equal(await input.inputValue(), '@railway keep this draft');
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${theme}: all five references, multi-provider send, device consent/binding, sent highlighting and offline recovery.`);
  }
  {
    const page = await browser.newPage(); await page.goto(`${server.url}/?delayed`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('@obsidian inspect');
    await page.getByRole('button', { name: 'Use Obsidian in this chat' }).click();
    await page.getByRole('button', { name: 'Use this project', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.releaseReferenceBinding));
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await page.getByRole('button', { name: 'Use Obsidian in this chat' }).click();
    await page.evaluate(() => window.releaseReferenceBinding());
    await page.getByText(/The chat or computer changed/).waitFor();
    assert.equal(await page.evaluate(() => window.referenceCalls.some(c => c.kind === 'attach')), false);
    await page.close(); console.log('PASS close/reopen during binding: cancelled authorization never attaches.');
  }
  for (const scenario of ['disconnected', 'dropped']) {
    const page = await browser.newPage(); await page.goto(`${server.url}/?${scenario}`);
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('@figma inspect');
    await page.getByText(scenario === 'disconnected' ? /Connect Figma in Integrations/ : /no longer available/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send message' }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.referenceCalls.some(c => c.kind === 'send')), false);
    await page.close(); console.log(`PASS ${scenario}: no silent tool-less send.`);
  }
} finally { await browser.close(); server.close(); }
