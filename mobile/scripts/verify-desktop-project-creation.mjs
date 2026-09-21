import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import assert from 'node:assert/strict';
const useWebKit = process.env.VIBYRA_TEST_WEBKIT === '1';
const out = resolve(`../output/project-creation${useWebKit ? '-webkit' : ''}`); await mkdir(out, { recursive: true });
const bundle = await build({ entryPoints: ['../desktop-tauri/tests/projectCreationFixture.tsx'], bundle: true, write: false,
  plugins: [{ name: 'fixture-art', setup(b) { b.onLoad({ filter: /\/modelArtwork\.ts$/ }, () => ({ contents: 'export const modelArtworkUrl = () => null;', loader: 'ts' })); } }],
  outfile: '/tmp/project-fixture.js', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' } });
const server = createServer((req, res) => {
  const file = bundle.outputFiles.find(f => req.url === '/fixture.js' ? f.path.endsWith('.js') : req.url === '/fixture.css' ? f.path.endsWith('.css') : false);
  res.setHeader('Content-Type', file ? req.url.endsWith('.js') ? 'application/javascript' : 'text/css' : 'text/html');
  res.end(file?.text ?? '<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = useWebKit ? await webkit.launch({ headless: true }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Each screen rises in; a shot taken mid-rise is evidence of a fade, not
    // of a layout. Wait for the entrance to finish before capturing one.
    const settled = () => page.waitForFunction(
      // Subtree: the stack rows cascade in one by one, so waiting on the step
      // element alone would shoot the list half-arrived.
      () => [...document.querySelectorAll('.np__step')]
        .every(el => el.getAnimations({ subtree: true }).length === 0));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}`);
    const slider = page.getByRole('slider', { name: 'Effort' });
    await slider.focus(); await slider.press('End'); assert.equal(await slider.getAttribute('aria-valuetext'), 'Ultra');
    await slider.press('Home'); assert.equal(await slider.getAttribute('aria-valuetext'), 'Low');
    for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Ultra');
    for (const width of [960, 720]) {
      await page.setViewportSize({ width, height: 700 });
      assert(await page.locator('.launch-effort').evaluate(el => {
        const box = el.getBoundingClientRect(); const track = el.querySelector('input').getBoundingClientRect();
        const heading = el.querySelector('.launch-effort__heading').getBoundingClientRect();
        return track.left >= box.left && track.right <= box.right && heading.bottom <= track.top && el.scrollWidth <= el.clientWidth;
      }));
      await page.screenshot({ path: `${out}/effort-${theme}-${width}.png` });
    }
    // The wizard, from the title bar: build something or adopt something, then
    // what are you making, which stack, what is it called, how is it set up,
    // and the build.
    await page.locator('.chrome').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('heading', { name: 'Start a project', exact: true }).waitFor();
    // The front door carries no progress rail: it is not one of the questions.
    assert.equal(await page.locator('.np__rail').count(), 0);
    await settled();
    await page.screenshot({ path: `${out}/new-project-start-${theme}.png` });
    await page.getByRole('button', { name: /Start something new/ }).click();
    await page.getByRole('heading', { name: 'What are you making?', exact: true }).waitFor();
    assert.equal(await page.locator('.np-kind').count(), 9, 'nine kinds, three by three');
    // The rail rides the kicker's line, and only the chosen kind takes cobalt.
    assert.equal(await page.locator('.np__meta .np__rail i').count(), 4);
    assert.equal(await page.locator('.np-kind--on').count(), 0);
    await settled();
    await page.screenshot({ path: `${out}/new-project-kind-${theme}.png` });
    await page.getByRole('button', { name: 'Mobile app' }).click();

    // A stack whose toolchain is missing stays readable and cannot be picked.
    await page.getByRole('heading', { name: 'Which stack?', exact: true }).waitFor();
    const flutter = page.getByRole('checkbox', { name: 'Flutter' });
    assert(await flutter.isDisabled(), 'Flutter needs a toolchain this computer does not have');
    assert.match(await flutter.textContent(), /Needs flutter/);
    assert.equal(await page.getByText('Recommended').count(), 1, 'one row leads the list');
    await settled();
    await page.screenshot({ path: `${out}/new-project-stack-${theme}.png` });

    // Every stack Vibyra can start, for when the one you want is filed elsewhere.
    await page.getByRole('button', { name: 'Other…' }).click();
    await page.getByRole('textbox', { name: 'Search every stack' }).fill('godot');
    await page.getByRole('checkbox', { name: 'Godot 4' }).waitFor();
    await page.getByRole('button', { name: /Back to mobile app stacks/ }).click();

    await page.getByRole('checkbox', { name: 'Expo (React Native)' }).click();
    // A server layers on top; picking it must not replace the base.
    await page.getByRole('checkbox', { name: 'Express' }).click();
    assert.equal(await page.locator('.np-stack--on').count(), 2, 'a project is often two stacks');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('heading', { name: 'Name your project', exact: true }).waitFor();
    assert.equal(await page.locator('.np-chip').count(), 2, 'the stacks just chosen are shown');
    await page.getByLabel('Project name').fill('!!!');
    assert(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled());
    await page.getByRole('alert').waitFor();
    await page.getByLabel('Project name').fill('My Next Project');
    await page.getByText('/fixture/my-next-project').waitFor();
    await settled();
    await page.screenshot({ path: `${out}/new-project-name-${theme}.png` });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Nothing is run that is not written on the setup screen — including the
    // `git init` the computer runs after the template's own steps.
    await page.getByRole('heading', { name: 'How should it be set up?', exact: true }).waitFor();
    await page.getByRole('button', { name: /Show the .* commands Vibyra will run/ }).click();
    const shown = await page.locator('.np-commands').textContent();
    assert.match(shown, /create-expo-app/); assert.match(shown, /my-next-project/);
    assert.match(shown, /git init/, 'the git switch has to appear in the list beside it');

    // GitHub is refused until the account actually has the connection, and the
    // row says what to do about it rather than failing at the end of a build.
    const github = page.getByRole('switch', { name: 'Create it on GitHub' });
    await github.waitFor();
    assert(await github.isDisabled(), 'no GitHub connection, no switch');
    assert.equal(await github.getAttribute('aria-checked'), 'false');
    await page.getByText('Connect GitHub to Vibyra').waitFor();
    await page.getByRole('button', { name: 'Connect GitHub in Settings' }).waitFor();
    await settled();
    await page.screenshot({ path: `${out}/new-project-github-off-${theme}.png` });
    await page.getByRole('switch', { name: 'Open a terminal when it is done' }).click();
    await settled();
    await page.screenshot({ path: `${out}/new-project-options-${theme}.png` });

    // A failed build leaves the folder alone and offers it rather than a retry.
    await page.evaluate(() => window.failNextBuild());
    await page.getByRole('button', { name: 'Start building', exact: true }).click();
    await page.getByText('Creating the app stopped with exit code 1.').waitFor();
    await page.getByRole('button', { name: 'Open the folder anyway', exact: true }).waitFor();
    await settled();
    await page.screenshot({ path: `${out}/new-project-failed-${theme}.png` });
    assert.equal(await page.getByTestId('active-project').count(), 0, 'a failed build registers nothing');
    await page.locator('.np-foot').getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.getByTestId('active-project').textContent(), 'original');

    // And again, from the sidebar, all the way through.
    await page.locator('.workspace-tree__heading').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('button', { name: /Start something new/ }).click();
    await page.getByRole('button', { name: 'Website' }).click();
    await page.getByRole('checkbox', { name: 'Next.js' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Project name').fill('Created project');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start building', exact: true }).click();
    await page.getByTestId('active-project').waitFor();
    assert.notEqual(await page.getByTestId('active-project').textContent(), 'original');
    const builds = await page.evaluate(() => window.requests.filter(r => r.command === 'scaffold_run'));
    assert.equal(builds.length, 2);
    assert.equal(builds[1].args.plan.dir, '/fixture/created-project');
    assert.equal(builds[1].args.plan.createDir, false, 'create-next-app owns the folder it makes');
    assert.equal(builds[1].args.plan.gitInit, true);
    assert(builds[1].args.plan.steps.every(s => Array.isArray(s.args)), 'steps are argv, never a shell string');

    // And with the connection in place: the switch works, the repository is
    // created with the project's own slug, and the folder is pushed into it.
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&github`);
    await page.locator('.chrome').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('button', { name: /Start something new/ }).click();
    await page.getByRole('button', { name: 'Website' }).click();
    await page.getByRole('checkbox', { name: 'Next.js' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Project name').fill('Shipped project');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const live = page.getByRole('switch', { name: 'Create it on GitHub' });
    await live.waitFor();
    assert(await live.isEnabled(), 'a connected account may create the repository');
    // The row shows the repository it will make: the owner, and the project's
    // own name from the naming step.
    assert.equal(await page.locator('.np-github__repo').textContent(), '@octocat/shipped-project');
    // Renaming the project renames the repository with it.
    await page.locator('.np__back').click();
    await page.getByLabel('Project name').fill('Renamed Thing');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert.equal(await page.locator('.np-github__repo').textContent(), '@octocat/renamed-thing');
    await page.locator('.np__back').click();
    await page.getByLabel('Project name').fill('Shipped project');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('switch', { name: 'Create it on GitHub' }).click();
    await settled();
    await page.screenshot({ path: `${out}/new-project-github-on-${theme}.png` });
    await page.getByRole('button', { name: 'Start building', exact: true }).click();
    await page.getByTestId('active-project').waitFor();
    const repo = await page.evaluate(() => window.requests.find(r => r.args?.path === 'connectors/github/repositories'));
    assert.equal(repo.args.body.name, 'shipped-project', 'the handle is shown, never sent');
    assert.equal(repo.args.body.private, true);
    const pushes = await page.evaluate(() => window.requests.filter(r => r.command === 'github_publish'));
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].args.remote, 'https://github.com/octocat/shipped-project.git');
    assert.equal(pushes[0].args.branch, 'main');

    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&models`);
    assert.equal(await page.locator('.launch-effort__stops i').count(), 6);
    await page.getByRole('button', { name: /More models/ }).click();
    const list = page.getByRole('listbox', { name: 'All models' });
    await list.hover(); await page.mouse.wheel(0, 1600);
    await page.waitForFunction(() => document.querySelector('.launch-model-browser__list').scrollTop > 100);
    assert(await list.evaluate(el => el.scrollHeight > el.clientHeight));
    await page.getByRole('option', { name: 'Model 36', exact: true }).click();
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.getByRole('textbox', { name: 'Search models' }).fill('Model 20');
    assert.equal(await page.getByRole('option').count(), 1);
    await page.getByRole('textbox', { name: 'Search models' }).press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await list.count(), 0);
    await page.getByRole('button', { name: /More models/ }).click();
    await page.screenshot({ path: `${out}/models-${theme}.png` });
    await page.keyboard.press('Escape'); assert.equal(await list.count(), 0);
    for (const provider of ['codex', 'claude']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?${theme}&${provider}`);
      const effort = page.getByRole('slider', { name: 'Effort' });
      await effort.focus(); await effort.press('End');
      const row = page.locator('.launch-effort');
      assert.equal(await row.getAttribute('data-effort'), provider === 'claude' ? 'ultracode' : 'ultra');
      assert.equal(await row.evaluate(el => getComputedStyle(el, '::before').animationName), 'effort-aurora');
      await effort.blur(); await page.screenshot({ path: `${out}/effort-${provider}-${theme}.png` });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await row.evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await effort.focus(); await effort.press('Home');
      assert.equal(await row.evaluate(el => getComputedStyle(el, '::before').content), 'none');
    }
    await page.evaluate(() => window.openApproval(3));
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await page.screenshot({ path: `${out}/checkpoint-${theme}.png` });
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => window.launchCount()), 0);
    await page.evaluate(() => window.openApproval(3));
    await page.getByRole('button', { name: 'Save & start 3 workers', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Preparing…', exact: true }).isDisabled());
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 1);
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.launchCount()), 1);
    await page.evaluate(() => window.openApproval(1, true));
    await page.getByRole('button', { name: 'Save & start worker', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'Save & start worker', exact: true }).isEnabled());
    await page.setViewportSize({ width: 420, height: 480 });
    assert(await dialog.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; }));
    await page.screenshot({ path: `${out}/checkpoint-compact-${theme}.png` });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: effort keyboard stops, compact layout, both themes, wizard from both entry points, missing toolchain, stack browser, layered stacks, name validation, literal commands, failed build, completed build, GitHub gated on the account connection, repository created and pushed, model wheel scrolling, search and selection.');
} finally { await browser.close(); server.close(); }
