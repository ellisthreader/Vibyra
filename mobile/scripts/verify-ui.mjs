import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture, fullyVisible, terminalText } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-ios-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] });
const url = process.env.VIBYRA_URL ?? 'http://localhost:8081';
let activePage;
try {
  for (const [device, width, height] of [['compact', 375, 667], ['large', 430, 932]]) {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, isMobile: true,
        hasTouch: true, reducedMotion: 'reduce' });
      activePage = page;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const shot = name => capture(page, `${out}/${device}-${colorScheme}-${name}.png`);
      const drawer = () => page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      const menu = async name => { await drawer(); await page.getByRole('button', { name, exact: true }).click(); };
      const session = async name => { await drawer(); await page.getByRole('tab', { name: 'All', exact: true }).click();
        await page.getByRole('button', { name, exact: true }).click(); };
      await page.goto(url);
      await page.getByRole('button', { name: 'Get started', exact: true }).waitFor();
      await shot('welcome');
      await page.getByRole('button', { name: 'I already have an account', exact: true }).click();
      await page.getByRole('button', { name: 'Log in', exact: true }).waitFor();
      await shot('login');
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      await page.getByRole('textbox', { name: 'Email' }).fill('ellis@example.com');
      await page.getByLabel('Password', { exact: true }).fill('short');
      await shot('account');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.getByText('Enter a valid email and a password with at least 8 characters.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      await page.getByRole('radio', { name: 'Code on this phone', exact: true }).click();
      assert.equal(await page.getByRole('radio', { name: 'Code on this phone', exact: true }).getAttribute('aria-checked'), 'true');
      await shot('path');
      await page.getByRole('button', { name: 'Start on phone', exact: true }).click();
      await page.getByText('Coding on your phone needs a Vibyra account.', { exact: true }).waitFor();
      await shot('account-required');
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      await page.getByRole('button', { name: 'Connect computer', exact: true }).click();
      await shot('computer-setup');
      await page.getByRole('button', { name: 'I’ve installed it', exact: true }).click();
      await shot('computer-network');
      await page.getByRole('button', { name: 'Use pairing code', exact: true }).click();
      await page.getByRole('textbox', { name: 'Computer pairing link' }).waitFor();
      await page.getByRole('button', { name: 'Close Connect your computer', exact: true }).click();
      await page.getByRole('button', { name: 'Skip — I’ll decide later', exact: true }).click();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      await page.reload();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Get started', exact: true }).count(), 0, 'The welcome flow stays dismissed after a reload');
      await shot('home');
      await page.getByRole('button', { name: 'Connect computer', exact: true }).click();
      await shot('computer-setup');
      await page.getByRole('button', { name: 'I’ve installed it', exact: true }).click();
      await shot('computer-network');
      await page.getByRole('button', { name: 'Use pairing code', exact: true }).click();
      await page.getByRole('textbox', { name: 'Computer pairing link' }).waitFor();
      await shot('connect');
      await page.getByRole('button', { name: 'Close Connect your computer', exact: true }).click();
      await menu('Settings');
      await page.getByRole('button', { name: 'Open sample workspace', exact: true }).click();
      await page.getByText('Sample workspace', { exact: true }).first().waitFor();
      await shot('sample-home');
      await session('A calmer checkout, Claude');
      await page.getByRole('tab', { name: 'Chat', exact: true }).waitFor();
      await shot('chat');
      const composer = page.getByRole('textbox', { name: 'Prompt for coding agent' });
      const draft = 'Keep the summary clear.\nLeave room for the next step.';
      await composer.fill(draft);
      await page.setViewportSize({ width, height: Math.max(450, height - 270) });
      await fullyVisible(page.getByRole('button', { name: 'Send prompt and Enter', exact: true }), page, 'Chat send button');
      await shot('composer-short-viewport');
      await page.setViewportSize({ width, height });
      await session('Add keyboard shortcuts, Codex');
      assert.equal(await composer.inputValue(), '', 'Another chat has a separate unsent draft');
      await page.getByRole('button', { name: 'Run project checks', exact: true }).click();
      await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor();
      await shot('decision');
      await page.getByRole('button', { name: 'Allow once', exact: true }).click();
      await session('A calmer checkout, Claude');
      assert.equal(await composer.inputValue(), draft, 'Switching chats preserves the original draft');
      await page.getByRole('button', { name: 'Review changes', exact: true }).first().click();
      await page.getByText('Example changes · No files on your computer are affected.', { exact: true }).waitFor();
      await shot('changes');
      await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
      await page.getByRole('button', { name: 'Open preview', exact: true }).first().click();
      await page.getByText('Make it yours.', { exact: true }).waitFor();
      await shot('preview');
      await page.getByRole('button', { name: 'Try sample checkout button', exact: true }).click();
      await page.getByText('This is a design example. No order was placed.', { exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Feedback on example preview' }).fill('Increase the summary spacing.');
      await page.getByRole('button', { name: 'Add feedback to task', exact: true }).click();
      assert.match(await composer.inputValue(), /Increase the summary spacing/);
      await composer.fill('CHAT_A_ISOLATION_MARKER');
      await page.getByRole('button', { name: 'Send prompt and Enter', exact: true }).click();
      await page.getByText('CHAT_A_ISOLATION_MARKER', { exact: true }).waitFor();
      await session('Add keyboard shortcuts, Codex');
      assert.equal(await page.getByText('CHAT_A_ISOLATION_MARKER', { exact: true }).count(), 0,
        'Chat messages cannot leak into another conversation');
      await session('Development server, Terminal');
      const terminalInput = page.getByRole('textbox', { name: 'Command for computer terminal' });
      await terminalInput.fill('TERMINAL_ISOLATION_MARKER');
      await page.getByRole('button', { name: 'Send command and Enter', exact: true }).click();
      await terminalText(page, 'TERMINAL_ISOLATION_MARKER');
      await page.setViewportSize({ width: height, height: width });
      await fullyVisible(page.getByRole('button', { name: 'Send command and Enter', exact: true }), page, 'Landscape terminal send button');
      await shot('terminal-landscape');
      await page.setViewportSize({ width, height });
      await session('A calmer checkout, Claude');
      await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
      const frame = await terminalText(page, 'CHAT_A_ISOLATION_MARKER');
      assert.equal(await frame.locator('body').innerText().then(text => text.includes('TERMINAL_ISOLATION_MARKER')), false,
        'Terminal output cannot leak between sessions');
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).fill('A draft carried into a new chat');
      await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
      assert.equal(await page.getByRole('radio', { name: 'Auto', exact: true }).getAttribute('aria-checked'), 'true',
        'Making no choice leaves the composer on Auto');
      assert.equal(await page.getByRole('radio', { name: 'Codex', exact: true }).count(), 0,
        'The picker offers OpenRouter models only');
      await shot('new-chat');
      await page.getByRole('radio', { name: 'Auto', exact: true }).click();
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Create chat', exact: true }).count(), 0,
        'Sending a chat never opens a session configuration sheet');
      assert.equal(await composer.inputValue(), 'A draft carried into a new chat', 'New chat prompt remains unsent');
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await page.getByRole('button', { name: 'Open terminal', exact: true }).click();
      assert.equal(await terminalInput.inputValue(), '', 'New terminal does not inherit the new chat prompt');
      await drawer();
      await page.getByRole('tab', { name: 'Terminals', exact: true }).click();
      assert.equal(await page.getByRole('tab', { name: 'Terminals', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByRole('button', { name: 'A calmer checkout, Claude', exact: true }).count(), 0);
      await page.getByRole('textbox', { name: 'Search chats' }).fill('QA new terminal');
      await shot('drawer');
      await page.getByRole('textbox', { name: 'Search chats' }).fill('');
      await page.getByRole('button', { name: 'Projects', exact: true }).click();
      await shot('projects');
      await menu('Computers'); await shot('computers');
      await menu('Settings'); await shot('settings');
      await page.getByRole('button', { name: 'Appearance', exact: true }).click();
      await page.getByRole('radio', { name: colorScheme === 'dark' ? 'Light' : 'Dark', exact: true }).click();
      await shot('switched-appearance');
      await page.getByRole('button', { name: 'Leave sample workspace', exact: true }).click();
      await page.getByRole('button', { name: 'Connect computer', exact: true }).waitFor();
      await menu('Settings');
      await page.getByRole('button', { name: 'Sign in or create account', exact: true }).click();
      await page.getByRole('button', { name: 'Log in', exact: true }).waitFor();
      await shot('account-sheet');
      await page.getByRole('button', { name: 'Close Your Vibyra account', exact: true }).click();
      await page.getByRole('button', { name: 'Show welcome again', exact: true }).click();
      await page.getByRole('button', { name: 'Get started', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS: ${device}/${colorScheme} welcome flow, account validation, path choice, chat/terminal isolation, draft handoff, decision, review, preview, navigation and appearance.`);
    }
  }
  console.log(`Screenshots: ${out}. Browser viewport checks; physical iPhone acceptance remains separate.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    console.error('Visible state:', await activePage.locator('body').innerText());
  }
  throw error;
} finally { await browser.close(); }
