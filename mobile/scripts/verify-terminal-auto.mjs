import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';
const fixture = await serveFixture('tests/projectLauncherFixture.tsx');
const safari = process.env.VIBYRA_TEST_WEBKIT === '1';
const browser = safari ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
await mkdir('../output/terminal-auto', { recursive: true });
async function project(page) {
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Pocket', exact: true }).click();
}
async function open(page, query) {
  await page.goto(`${fixture.url}/?funded=1&restore-sessions=1&${query}`); await project(page);
  await page.getByRole('button', { name: 'More models', exact: true }).waitFor();
  assert.equal(await page.getByRole('radio', { name: /Vibyra Auto/ }).count(), 0, 'Auto is absent from main page');
  await page.getByRole('button', { name: 'More models', exact: true }).click();
  await page.getByRole('radio', { name: 'Vibyra Auto', exact: true }).click();
  await page.getByRole('button', { name: 'More models', exact: true }).getByText('Vibyra Auto', { exact: true }).waitFor();
}
try {
  for (const theme of ['dark', 'light']) for (const source of ['accounts', 'vibyra']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await open(page, `theme=${theme}`);
    if (source === 'vibyra') {
      await page.getByRole('tab', { name: 'Vibyra tokens', exact: true }).click();
      await page.getByRole('radio', { name: 'Vibyra Auto', exact: true }).click();
    }
    assert.equal(await page.getByRole('textbox').count(), 0, 'no task box on New terminal');
    assert.equal(await page.getByText(/Jev/i).count(), 0);
    await page.screenshot({ path: `../output/terminal-auto/${source}-${theme}${safari ? '-webkit' : ''}.png` });
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
    await page.getByTestId('auto-terminal').waitFor();
    await page.screenshot({ path: `../output/terminal-auto/${source}-${theme}-empty${safari ? '-webkit' : ''}.png` });
    assert.equal(await page.evaluate(() => window.launcherEvents.decisions.length + window.launcherEvents.starts.length + window.launcherEvents.funded.length), 0);
    if (source === 'accounts' && theme === 'dark') { await page.reload(); await project(page); await page.getByTestId('auto-terminal').waitFor(); }
    const prompt = 'Diagnose the concurrency bug in the queue';
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill(prompt);
    assert.equal(await page.evaluate(() => window.launcherEvents.decisions.length), 0, 'typing never routes');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(() => window.launcherEvents.messages.length + window.launcherEvents.submissions.length === 1);
    const events = await page.evaluate(() => window.launcherEvents);
    assert.equal(events.decisions.length, 1);
    assert.equal(events.decisions[0].source, source);
    assert.equal(events.decisions[0].text, prompt);
    if (source === 'accounts') {
      assert.equal(events.funded.length, 0);
      assert.equal(events.starts[0][1], 'claude');
      assert.equal(events.starts[0][3].model, 'anthropic/claude-opus-5.5');
      assert.equal(events.starts[0][3].effort, 'high');
      assert.equal(events.messages[0][0], prompt);
      assert.equal(events.messages[0][3], 'new-terminal');
      assert.ok(events.decisions[0].models.every(m => m.id.startsWith('openai/') || m.id.startsWith('anthropic/')));
    } else {
      assert.equal(events.starts.length, 0);
      assert.equal(events.funded[0].model, 'anthropic/claude-opus-5.5');
      assert.equal(events.quotes[0][1], prompt);
      assert.equal(events.quotes[0][2], events.funded[0].model);
      await page.getByTestId('funded-terminal').waitFor();
    }
    await page.getByTestId('auto-selection').waitFor();
    assert.match(await page.getByTestId('auto-selection').innerText(), source === 'accounts' ? /Claude Opus 5.5[\s\S]*Auto selected · High effort/ : /Claude Opus 5.5[\s\S]*Auto selected · No adjustable effort/);
    await page.screenshot({ path: `../output/terminal-auto/${source}-${theme}-selected${safari ? '-webkit' : ''}.png` });
    if (source === 'accounts') { await page.reload(); await project(page); await page.getByTestId('auto-selection').waitFor(); }
    await page.close();
  }
  for (const failure of ['auto-fail', 'send-fail']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await open(page, `${failure}=1`);
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message Vibyra AI' }).fill('Keep my task');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText(failure === 'auto-fail' ? 'Auto unavailable' : 'Delivery uncertain', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Message Vibyra AI' }).inputValue(), 'Keep my task');
    if (failure === 'auto-fail') assert.equal(await page.evaluate(() => window.launcherEvents.starts.length), 0);
    else {
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByText('Open the terminal to check your message before sending again.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.launcherEvents.messages.length), 1, 'uncertain delivery is never repeated');
      assert.equal(await page.evaluate(() => window.launcherEvents.starts.length), 1);
    }
    await page.close();
  }
  for (const scenario of ['signed-out-default', 'disconnected-provider', 'codex-only', 'no-conversations', 'invalid-decision', 'large-message', 'decision-slow', 'slow', 'fail']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await open(page, `${scenario}=1`);
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    await input.fill(scenario === 'large-message' ? '界'.repeat(3000) : 'Original task');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    if (['signed-out-default', 'disconnected-provider', 'codex-only'].includes(scenario)) {
      await page.getByTestId('auto-selection').waitFor();
      const events = await page.evaluate(() => window.launcherEvents);
      if (scenario === 'signed-out-default') {
        assert.equal(events.starts[0][3].model, 'anthropic/claude-opus-5.5', 'matches Mac fallback to another connected account');
      } else {
        assert.ok(events.decisions[0].models.every(m => m.id.startsWith('openai/')), 'only connected providers with conversation support are candidates');
        assert.equal(events.starts[0][3].model, 'openai/gpt-6-sol');
      }
      assert.match(await page.getByTestId('auto-selection').innerText(), /High effort/);
    } else if (scenario === 'decision-slow') {
      await page.waitForFunction(() => !!window.launcherEvents.finish);
      await page.evaluate(() => window.launcherEvents.connection('offline'));
      await page.waitForFunction(() => window.launcherEvents.status === 'offline');
      await page.evaluate(() => window.launcherEvents.connection('connected'));
      await page.waitForFunction(() => window.launcherEvents.status === 'connected');
      await page.evaluate(() => window.launcherEvents.finish());
      await page.waitForTimeout(150); // Allow the released promise chain to settle after the connection transition.
      assert.equal(await page.evaluate(() => window.launcherEvents.starts.length), 0, 'reconnected stale decision never launches');
    } else if (scenario === 'slow') {
      await page.waitForFunction(() => !!window.launcherEvents.finish);
      await input.fill('Changed during launch');
      assert.equal(await input.inputValue(), 'Original task', 'draft cannot change during first-send handoff');
      await page.evaluate(() => window.launcherEvents.finish());
      await page.getByTestId('auto-selection').waitFor();
      assert.equal(await page.evaluate(() => window.launcherEvents.messages[0][0]), 'Original task');
    } else if (scenario === 'fail') {
      await page.getByText('Your computer could not start this terminal.', { exact: true }).waitFor();
      await input.fill('Changed task');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByText('This terminal was picked for your original message. Restore it to retry, or open a new Auto terminal.', { exact: true }).waitFor();
      await input.fill('Original task');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByText('Your computer could not start this terminal.', { exact: true }).waitFor();
      const events = await page.evaluate(() => window.launcherEvents);
      assert.equal(events.decisions.length, 1);
      assert.equal(events.starts.length, 2);
      assert.equal(events.starts[0][3].requestId, events.starts[1][3].requestId, 'ambiguous launch retries reuse the same receipt');
    } else {
      await page.getByText(scenario === 'no-conversations' ? 'Update Vibyra on your computer to use Auto.'
        : scenario === 'invalid-decision' ? 'Auto returned a model or effort that is no longer available. Choose again.' : 'Use a message under 8 KB.', { exact: true }).waitFor();
      const events = await page.evaluate(() => window.launcherEvents);
      assert.equal(events.starts.length + events.messages.length + events.funded.length, 0);
      assert.equal(events.decisions.length, scenario === 'invalid-decision' ? 1 : 0);
    }
    await page.close();
  }
  console.log('Auto: clean launcher, deferred first Send, both sources, exact model/effort/message, restored attribution, provider/default eligibility, stale reconnects, bounded UTF-8 and durable retry safety passed.');
} finally { await browser.close(); await fixture.close(); }
