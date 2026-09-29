import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveFixture } from './fixture-server.mjs';

const fixture = await serveFixture('tests/workScreenFixture.tsx');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const scenarios = [
  { query: '&connected', options: [['Open a project', 'projectsOpened'], ['Start a project', 'newProjectOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '&connected&empty', options: [['Start a project', 'newProjectOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '', options: [['Connect your computer', 'connectOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '&remembered', options: [['Connect your computer', 'connectOpened'], ['Browse saved projects', 'projectsOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '&connected&viewOnly', options: [['Open a project', 'projectsOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '&connected&empty&viewOnly', options: [['Connect another computer', 'connectOpened'], ['Open Agents', 'agentsOpened']] },
  { query: '&noAgents', options: [['Connect your computer', 'connectOpened']] },
];
try {
  for (const theme of ['dark', 'light']) for (const scenario of scenarios) for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.url}/?theme=${theme}${scenario.query}`);
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Choose AI model' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'New chat' }).count(), 0, 'The empty project home has no misleading compose action');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    if (process.env.WORK_PICKER_SHOTS && (scenario.query === '&connected' || viewport.width === 390 && ['', '&connected&empty'].includes(scenario.query)))
      await page.screenshot({ path: `/private/tmp/vibyra-start-actions-${scenario.query === '&connected' ? 'projects' : scenario.query ? 'empty' : 'offline'}-${theme}-${viewport.width}.png` });
    for (const [name, flag] of scenario.options) {
      const button = page.getByRole('button', { name });
      const box = await button.boundingBox();
      assert.ok(box && box.y + box.height <= viewport.height, `${name} stays visible on the first screen`);
      await button.click();
      assert.equal(await page.evaluate(key => window[key], flag), true, `${name} opens its destination`);
    }
    assert.equal(await page.getByRole('button', { name: 'Open Agents' }).count(), scenario.query === '&noAgents' ? 0 : 1);
    if (scenario.query.includes('viewOnly')) assert.equal(await page.getByRole('button', { name: 'Start a project' }).count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS Code home: every available starting action opens its destination in compact/dark/light states.');
} finally { await browser.close(); fixture.close(); }
