import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { capture, fullyVisible, openSession, terminalText } from './ui-test-helpers.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-ios-screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(),
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
      // A session sits in its project's face of the rail; the sample's Codex chat is in Orbit, the rest in Studio.
      const session = name => openSession(page, name, name.startsWith('Add keyboard shortcuts') ? 'Orbit' : 'Studio');
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
      // Setup emails a download link now (src/connection/HostLinkAction.tsx); there is no pairing-code page behind it.
      await page.getByRole('button', { name: 'Email me the download link', exact: true }).waitFor();
      await page.getByRole('button', { name: 'I’ve installed it', exact: true }).click();
      await shot('computer-network');
      await page.getByRole('button', { name: 'Close Connect your computer', exact: true }).click();
      await page.getByRole('button', { name: 'Skip — I’ll decide later', exact: true }).click();
      // The app opens in Ideas, the phone's chat, and asks for no computer.
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      await page.reload();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Get started', exact: true }).count(), 0, 'The welcome flow stays dismissed after a reload');
      await shot('home');
      // A computer is added from the rail's + Project, from Remote or from Settings; never from the chat.
      await menu('New project');
      await shot('computer-setup');
      await page.getByRole('button', { name: 'I’ve installed it', exact: true }).click();
      await shot('connect');
      await page.getByRole('button', { name: 'Close Connect your computer', exact: true }).click();
      await menu('Settings');
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
      await page.getByRole('button', { name: 'Open terminal', exact: true }).waitFor();
      await shot('sample-home');
      await session('A calmer checkout, Claude');
      const composer = page.getByRole('textbox', { name: 'Prompt for coding agent' });
      await composer.waitFor();
      // A chat is the app header and the conversation: no view switch, no project row.
      assert.equal(await page.getByRole('tab').count(), 0, 'A chat shows no Chat/Terminal switch');
      assert.equal(await page.getByRole('button', { name: 'Open session project', exact: true }).count(), 0,
        'A chat shows no project row');
      await shot('chat');
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
      // No box: the terminal itself is typed into, and the sample shell echoes the line.
      const typeIntoTerminal = async text => {
        await page.locator('iframe[title="Interactive terminal"]').click();
        await page.keyboard.type(text);
        await page.keyboard.press('Enter');
      };
      await typeIntoTerminal('TERMINAL_ISOLATION_MARKER');
      const frame = await terminalText(page, 'TERMINAL_ISOLATION_MARKER');
      assert.equal(await frame.locator('body').innerText().then(text => text.includes('CHAT_A_ISOLATION_MARKER')), false,
        'Terminal output cannot leak between sessions');
      // A terminal has no project row: its options sit in the header's action slot instead.
      assert.equal(await page.getByRole('button', { name: 'Open session project', exact: true }).count(), 0,
        'A terminal shows no project row');
      await page.getByRole('button', { name: 'Session options', exact: true }).waitFor();
      await page.setViewportSize({ width: height, height: width });
      await fullyVisible(page.locator('iframe[title="Interactive terminal"]'), page, 'Landscape terminal output');
      await shot('terminal-landscape');
      await page.setViewportSize({ width, height });
      // An open terminal's header action is its options, so a new chat starts from the menu.
      await menu('New chat');
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).fill('A draft carried into a new chat');
      await page.getByRole('button', { name: 'Choose AI model', exact: true }).click();
      assert.equal(await page.getByRole('radio', { name: 'Auto', exact: true }).getAttribute('aria-checked'), 'true',
        'Making no choice leaves the composer on Auto');
      assert.equal(await page.getByRole('radio', { name: 'Codex', exact: true }).count(), 0,
        'The picker offers OpenRouter models only');
      // The regression this exists to stop: the catalogue used to be gated on the
      // runtime, so the browser, Android and the sample workspace were handed an
      // empty list and showed Auto and nothing else. Auto is a choice among many,
      // never the only one on offer.
      const catalogue = page.getByRole('dialog', { name: 'Choose your AI' });
      const companies = await catalogue.locator('[aria-expanded]').evaluateAll(
        nodes => nodes.map(node => node.getAttribute('aria-label')));
      assert.ok(companies.length >= 5, `Every runtime can read the catalogue, saw ${companies.length} companies`);
      for (const company of ['OpenAI', 'Anthropic', 'Google'])
        assert.ok(companies.includes(company), `${company} is missing from the picker`);
      await page.getByRole('button', { name: 'Anthropic', exact: true }).click();
      assert.ok(await catalogue.getByRole('radio').count() > 1, 'A company opens to reveal its models');
      await shot('new-chat');
      await page.getByRole('radio', { name: 'Auto', exact: true }).click();
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Create chat', exact: true }).count(), 0,
        'Sending a chat never opens a session configuration sheet');
      assert.equal(await composer.inputValue(), 'A draft carried into a new chat', 'New chat prompt remains unsent');
      await menu('New chat');
      await page.getByRole('button', { name: 'Open terminal', exact: true }).click();
      const fresh = await terminalText(page, '$');
      assert.equal((await fresh.locator('body').innerText()).includes('A draft carried into a new chat'), false,
        'New terminal does not inherit the new chat prompt');
      await drawer();
      assert.equal(await page.getByRole('tab').count(), 0, 'Recents carries no filter tabs');
      // Search opens from the icon beside the logo, so the rail's top stays one line.
      await page.getByRole('button', { name: 'Search chats', exact: true }).click();
      await page.getByRole('textbox', { name: 'Search chats' }).fill('QA new terminal');
      await shot('drawer');
      await page.getByRole('button', { name: 'Close search', exact: true }).click();
      await page.getByRole('button', { name: /^Studio, / }).click();
      await shot('projects');
      await page.getByRole('button', { name: 'Close navigation menu', exact: true }).click();
      await menu('Remote'); await shot('computers');
      await menu('Settings'); await page.getByRole('dialog', { name: 'Settings' }).waitFor(); await shot('settings');
      // Appearance is set right in the sheet's list, as tiles.
      await page.getByRole('radio', { name: colorScheme === 'dark' ? 'Light' : 'Dark', exact: true }).click();
      await shot('switched-appearance');
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      await page.getByRole('switch', { name: 'Sample workspace', exact: true }).click();
      await page.getByRole('textbox', { name: 'Prompt for new chat' }).waitFor();
      await menu('Settings');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('button', { name: 'Log in', exact: true }).waitFor();
      await shot('account-sheet');
      await page.getByRole('button', { name: 'Close Your Vibyra account', exact: true }).click();
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
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
