import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const { chromium, webkit } = createRequire(import.meta.url)('playwright-core');
const base = process.env.VIBYRA_MARKETING_URL || 'http://127.0.0.1:8128';
const output = process.env.VIBYRA_MARKETING_QA_DIR || '/tmp/vibyra-phone-review';
await mkdir(output, { recursive: true });
// Signed-in layout fixture only. No credentials or real account changes.

for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
const b=await type.launch();const p=await b.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const html=await (await p.request.get(base + '/login')).text();
await p.route('**/account',r=>r.fulfill({contentType:'text/html',body:html}));
await p.route('**/web-api/session',r=>r.fulfill({json:{user:{id:'phone-review',name:'Sample Account',email:'sample.long.email@example.test',emailVerified:true,desktopSignedIn:false,provider:'email',devices:[]}}}));
await p.route('**/web-api/analytics/consent',r=>r.fulfill({json:{choice:'declined',can_link:false}}));
await p.route('**/web-api/billing/account?version=2',r=>r.fulfill({status:503,json:{}}));
await p.route('**/web-api/billing/activity',r=>r.fulfill({json:{items:[]}}));
p.on('pageerror',e=>console.log('ERROR',e.message));
for(const view of ['membership','downloads','connect']){
await p.goto(base + '/account#'+view);await p.locator('.account-jump').waitFor();await p.waitForTimeout(800);
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320);
const links = await p.getByRole('navigation', { name: 'Account sections' }).locator('a').evaluateAll(links => links.map(a => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44; }));
assert.deepEqual(links, [true, true, true]);

console.log(name, view, 'passed');
await p.screenshot({path:`${output}/${name}-account-${view}.png`,fullPage:true});
}
await b.close();}
