import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const output = resolve('../desktop-tauri/src/assets/welcome');
await mkdir(output, {recursive:true});
const main = await readFile('../desktop-tauri/src/main.tsx','utf8');
// Skip the introduction itself: these are captures of the product it introduces.
const styles = [...main.matchAll(/import "(\.\/styles\/[^\"]+)"/g)].filter(m => !m[1].includes('first-welcome')).map(m => `import ${JSON.stringify(resolve('../desktop-tauri/src',m[1]))};`).join('\n');
const bundle = await build({stdin:{contents:`${styles}\nimport ${JSON.stringify(resolve('../desktop-tauri/tests/welcomeCaptureFixture.tsx'))};`,resolveDir:process.cwd()},plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}],bundle:true,write:false,outfile:'/tmp/capture.js',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.webp':'dataurl','.woff2':'dataurl','.ttf':'dataurl'}});
const server = createServer(async(req,res) => {
  if (req.url.includes('/assets/teammates/')) { res.setHeader('Content-Type','image/webp'); res.end(await readFile(resolve('../desktop-tauri/src/assets/teammates',req.url.split('/').at(-1)))); return; }
  const file = bundle.outputFiles.find(f => req.url === '/capture.js' ? f.path.endsWith('.js') : req.url === '/capture.css' ? f.path.endsWith('.css') : false);
  res.setHeader('Content-Type',file ? req.url.endsWith('.js') ? 'text/javascript' : 'text/css' : 'text/html');
  res.end(file?.contents ?? '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/capture.css"><style>.product-mode-switch > button{display:none}</style><div id="root"></div><script src="/capture.js"></script>');
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true});
try {
  for (const theme of ['dark','light']) {
    const page = await browser.newPage({viewport:{width:1200,height:740},deviceScaleFactor:1.5,reducedMotion:'reduce'});
    page.on('pageerror', e => console.error(e.message));
    for (const scene of ['home','code','agents','phone']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?scene=${scene}&theme=${theme}`);
      await page.evaluate(() => document.fonts.ready);
      if (scene === 'code') { await page.locator('.xterm').nth(3).waitFor(); await page.evaluate(() => window.seedWelcomeTerminals()); }
      if (scene === 'agents') { await page.locator('.teammate-row').first().click(); await page.locator('.teammate-bubble.them').waitFor(); }
      if (scene === 'phone') await page.getByRole('switch',{name:'Remote phone control',exact:true}).waitFor();
      await page.waitForTimeout(500);
      const target = scene === 'phone' ? page.locator('.settings-modal') : page;
      await target.screenshot({path:`${output}/${scene}-${theme}.jpg`,type:'jpeg',quality:92});
      if (scene === 'code') {
        assert.equal(await page.locator('.adaptive-pane-host .xterm').count(), 4);
        assert.equal(await page.locator('[data-agent-view="chat"]:visible').count(), 0);
      }
      if (scene === 'agents') {
        for (const width of [1200,800]) {
          await page.setViewportSize({width,height:740});
          const controls = await page.locator('.teammate-composer-toolbar').evaluate(el => {
            const box = node => { const r = node.getBoundingClientRect(); return {x:r.x,right:r.right,y:r.y,width:r.width}; };
            return {row:box(el),attach:box(el.querySelector('label')),model:box(el.querySelector('select')),mic:box(el.querySelector('.teammate-mic')),send:box(el.querySelector('.teammate-send')),overflow:el.scrollWidth > el.clientWidth};
          });
          assert.equal(controls.overflow,false);
          assert.ok(controls.model.x - controls.attach.right < 20, 'model stays beside attachment');
          assert.ok(controls.send.x - controls.mic.right < 20, 'mic stays beside send');
          assert.ok(controls.send.right <= controls.row.right + 1);
          assert.ok(Math.abs(controls.send.y - controls.mic.y) < 1, 'actions share a baseline');
        }
        await page.setViewportSize({width:1200,height:740});
      }
    }
    await page.close();
  }
  await writeFile(`${output}/README.md`, '# Welcome product captures\n\nCaptured from production React components with sample content, not drawn mock interfaces.\nRefresh with `node scripts/capture-welcome-product.mjs` from `mobile/`.\nDesktop: `tests/welcomeCaptureFixture.tsx` (home, four real xterm panes with sample output, Agents, Settings > Phone).\niPhone: `mobile/tests/welcomePhoneFixture.tsx`, captured by `capture-welcome-phone.mjs`. Production ConnectFlow, DiscoveryStep, ConnectionProgress and ComputersScreen rendered via React Native Web with sample discovery/handshake. WebM clips preserve their actual animations; these are not native-device recordings.\nPhone assets: 780×1560 DPR2 JPEG frames encoded once at 25fps. Capture-only modal styling removes the top gutter and duplicate corners; preserve the exact 1:2 screen ratio inside the bezel.\nNo real account data, pairing invitations, network operations or running tasks.\nThe small temporary Test intro control is omitted from the title bar capture.\n');
  console.log('Captured actual desktop and iPhone components in both themes.');
} finally { await browser.close(); server.close();  }

await import("./capture-welcome-phone.mjs");
