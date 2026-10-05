import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium, webkit } = createRequire(import.meta.url)('playwright-core');
const base = process.env.VIBYRA_MARKETING_URL || 'http://127.0.0.1:8128';
const output = process.env.VIBYRA_MARKETING_QA_DIR || '/tmp/vibyra-phone-review';
await mkdir(output, { recursive: true });
const results = [];
// Run against the local website. API consent is stubbed; sample interactions
// never submit signups, waitlist entries, billing changes or real account edits.
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
const b=await type.launch();const p=await b.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
await p.route('**/web-api/analytics/consent',r=>r.fulfill({json:{choice:'declined',can_link:false}}));
await p.goto(base);
const demo=p.locator('#walkthrough');
await demo.scrollIntoViewIfNeeded();
assert.equal(await demo.locator('.vdev-dock').count(),0);
await demo.screenshot({path:`${output}/${name}-320-demo.png`});
await demo.getByRole('button',{name:'Show projects sidebar'}).click();
await demo.locator('.vdev-session-open').first().click();
assert.equal(await demo.locator('.vdev-rail').count(),0);
await demo.getByRole('button',{name:'Workspace sidebar',exact:true}).click();
for(const tab of ['Chat','Worktrees','Preview']){
 await demo.getByRole('tablist',{name:'Companion tools'}).getByRole('tab',{name:tab,exact:true}).click();
 await demo.screenshot({path:`${output}/${name}-320-${tab}.png`});
}
await demo.getByRole('button',{name:'Close sidebar',exact:true}).click();
await demo.getByRole('tab',{name:'Agents',exact:true}).click();
await demo.screenshot({path:`${output}/${name}-320-agents.png`});
await demo.getByRole('tab',{name:'Code',exact:true}).click();
await demo.getByRole('button',{name:'New project',exact:true}).click();
await demo.screenshot({path:`${output}/${name}-320-project.png`});
await demo.getByRole('button',{name:'Close dialog',exact:true}).click();
await p.getByRole('button',{name:'Open menu',exact:true}).click();
await p.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Mobile',exact:true}).click();
assert.equal(await p.locator('#home-mobile-menu').count(),0);
await p.getByRole('button',{name:'See preview',exact:true}).click();
await p.screenshot({path:`${output}/${name}-320-tour.png`});
await p.keyboard.press('Escape');
await p.getByRole('button',{name:'Join iPhone waitlist',exact:true}).click();
await p.screenshot({path:`${output}/${name}-320-waitlist.png`});
await p.keyboard.press('Escape');
await p.setViewportSize({width:667,height:375});
await p.getByRole('button',{name:'Open menu',exact:true}).click();
await p.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Log in',exact:true}).click();
await p.waitForURL('**/login');
console.log(name, 'interactions passed');
const errors = [];
p.on('pageerror', error => errors.push(error.message));
for (const width of [320, 390, 430, 768, 1440]) {
 await p.setViewportSize({ width, height: 844 });
 for (const path of ['/', '/downloads', '/benchmarks', '/login', '/signup', '/billing', '/checkout',
   '/billing/success', '/billing/cancel', '/forgot-password', '/legal/privacy', '/legal/terms']) {
  const response = await p.goto(base + path);
  await p.waitForLoadState('networkidle');
  const layout = await p.evaluate(() => ({
   scroll: document.documentElement.scrollWidth,
   broken: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.getAttribute('src')),
  }));
  assert.equal(response.status(), 200, `${name} ${path}`);
  assert.ok(layout.scroll <= width, `${name} ${width} ${path}: horizontal overflow ${layout.scroll}`);
  assert.deepEqual(layout.broken, [], `${name} ${width} ${path}: broken images`);
  results.push({ engine: name, width, path, ...layout });
 }
}
assert.deepEqual(errors, []);
await b.close();
}

await writeFile(`${output}/phone-verification.json`, JSON.stringify({ passed: true, results }, null, 2));
