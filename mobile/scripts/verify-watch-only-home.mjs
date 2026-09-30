// A Vibyra Desktop only lets the phone watch. On the iPhone that must never end at
// "start it on the computer": Ideas is the phone's own chat, where sending just
// works, and a prompt typed in the Mac's project becomes a new chat on the phone.
// A standalone Host, which can start work, keeps the project home it always had.
// Either way the app opens in Ideas; connecting never swaps the screen.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { capture } from './ui-test-helpers.mjs';
import { serveFixture } from './fixture-server.mjs';

const out = process.env.VIBYRA_SHOTS ?? '/tmp/vibyra-watch-only-home'; await mkdir(out, { recursive: true });
const { url, close } = await serveFixture('tests/watchOnlyHomeFixture.tsx');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const ideas = page.getByRole('button', { name: /^Ideas, / });
    const pocket = page.getByRole('button', { name: /^Pocket, / });
    const phoneChat = page.getByRole('textbox', { name: 'Message Vibyra AI' });
    const computerPrompt = page.getByRole('textbox', { name: 'Prompt for new chat' });

    await page.goto(`${url}/?theme=${theme}`);
    await phoneChat.waitFor();
    assert.equal(await computerPrompt.count(), 0, 'The app opens in Ideas, the phone chat');
    // A standalone Host's folder has the computer home: terminals start there.
    await button('Open navigation menu').click();
    await ideas.waitFor(); await pocket.click();
    await button('Close navigation menu').click();
    await computerPrompt.waitFor();
    await button('Open terminal').waitFor();
    assert.equal(await phoneChat.count(), 0, 'A folder on a Host opens on the computer home');

    await page.goto(`${url}/?watching=1&theme=${theme}`);
    await phoneChat.waitFor();
    await button('Add to chat').click();
    await page.getByRole('menu', { name: 'Add to chat' }).waitFor();
    assert.equal(await button('Attach a project').count(), 0, 'A watch-only Mac is not offered for project tools');
    await button('Close attach menu').click();
    await page.getByRole('menu', { name: 'Add to chat' }).waitFor({ state: 'detached' });
    await capture(page, `${out}/${theme}-home.png`);
    await phoneChat.fill('Plan a calmer settings page');
    await page.getByText('This reply uses up to 2 Vibes', { exact: true }).waitFor();
    await button('Send message').click();
    await page.getByText('A reply from the phone chat.', { exact: true }).waitFor();
    await capture(page, `${out}/${theme}-sent.png`);

    // The Mac's project is one tap away in the rail, and what is typed there is not refused.
    await button('New chat').click();
    await button('Open navigation menu').click();
    await pocket.click();
    await button('Close navigation menu').click();
    await computerPrompt.fill('Add a dark mode toggle');
    await page.getByText('New chats run here on your iPhone.', { exact: true }).waitFor();
    await capture(page, `${out}/${theme}-computer.png`);
    await button('Send message').click();
    await phoneChat.waitFor();
    assert.equal(await phoneChat.inputValue(), 'Add a dark mode toggle', 'The prompt carries into the phone chat');
    assert.equal(await page.getByText(/watches your Mac/).count(), 0, 'No hint sends the person to the computer');
    assert.equal(await page.getByText('A reply from the phone chat.', { exact: true }).count(), 0, 'It is a new chat');
    await capture(page, `${out}/${theme}-handoff.png`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS watch-only home: projects are home, Ideas sends, the Mac's project hands prompts over, Host unchanged. Shots: ${out}`);
} finally { await browser?.close(); close(); }
