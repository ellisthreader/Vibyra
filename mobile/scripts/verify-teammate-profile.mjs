import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
const out=resolve('../output/teammate-profile');await mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['../desktop-tauri/tests/teammateProfileFixture.tsx'],bundle:true,write:false,outfile:'/tmp/redesign.js',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}]});
const server=createServer(async(req,res)=>{if(req.url.includes('/assets/teammates/')){try{res.setHeader('Content-Type','image/webp');res.end(await readFile(resolve('../desktop-tauri/src/assets/teammates',req.url.split('/').at(-1))));return;}catch{res.statusCode=404;res.end();return;}}const file=bundle.outputFiles.find(f=>req.url==='/fixture.js'?f.path.endsWith('.js'):req.url==='/fixture.css'?f.path.endsWith('.css'):false);res.setHeader('Content-Type',file?(req.url.endsWith('.js')?'application/javascript':'text/css'):'text/html');res.end(file?.text??'<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=process.env.VIBYRA_TEST_WEBKIT?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const theme of ['dark','light']){
 const p=await browser.newPage({viewport:{width:1100,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const b=name=>p.getByRole('button',{name,exact:true});
 await p.goto(`http://127.0.0.1:${server.address().port}/?${theme}`);
 await b('New teammate').last().click();
 await p.getByLabel('Name',{exact:true}).fill('Website reviewer');
 await p.getByLabel('Brief',{exact:true}).fill('Review my website and explain useful improvements.');
 await p.getByRole('radio',{name:/Anthropic/}).click();
 await p.getByRole('tab',{name:'Skills',exact:true}).click();await p.getByRole('checkbox',{name:/Review checklist/}).click();
 await b('New skill').click();await p.getByLabel('Skill name').fill('Source review');await p.getByLabel('Skill instructions').fill('Check every factual claim against its original source.');assert.equal(await b('Create teammate').isDisabled(),true);await b('Save skill').click();await p.getByRole('checkbox',{name:/Source review/}).waitFor();assert.equal(await p.getByRole('checkbox',{name:/Source review/}).isChecked(),true);
 await p.getByRole('tab',{name:'Profile',exact:true}).click();
 await p.getByRole('tab',{name:'Profile',exact:true}).focus();await p.keyboard.press('End');assert.equal(await p.getByRole('tab',{name:'Access',exact:true}).getAttribute('aria-selected'),'true');await p.keyboard.press('Home');
 assert.equal(await p.getByRole('dialog').count(),0);
 const rail=await p.getByRole('complementary',{name:'Teammates navigation'}).boundingBox(), form=await p.getByRole('form',{name:'New teammate'}).boundingBox(); assert.ok(form.x>=rail.x+rail.width-1,'editor occupies centre beside real rail');
 await p.getByRole('tab',{name:'Access',exact:true}).click();await p.getByRole('checkbox',{name:/GitHub/}).check();
 const check=await p.getByRole('checkbox',{name:/GitHub/}).boundingBox();assert.ok(check.width<=20);await p.screenshot({path:out+`/mac-${theme}-access.png`});
 await p.getByRole('tab',{name:'Profile',exact:true}).click();
 await p.screenshot({path:out+`/mac-${theme}.png`});await b('Create teammate').click();
 assert.equal(await p.evaluate(()=>window.savedProfile.model),'provider:anthropic');assert.deepEqual(await p.evaluate(()=>window.savedProfile.skillIds),['skill-review',await p.evaluate(()=>window.createdSkill.id)]);
 await b('Teammate details').click();assert.equal(await p.getByRole('radio',{name:/Anthropic/}).isChecked(),true);
 await p.getByRole('tab',{name:'Memory',exact:true}).click();await p.getByLabel('Saved context').fill('Cite your sources.');await b('Back to teammates').click();await b('Teammate details').click();await p.getByRole('tab',{name:'Memory',exact:true}).click();assert.equal(await p.getByLabel('Saved context').inputValue(),'Cite your sources.');await b('Save changes').click();assert.equal(await p.evaluate(()=>window.savedProfile.memory),'Cite your sources.');
 await b('Teammate details').click();await p.setViewportSize({width:700,height:480});const footer=await b('Save changes').boundingBox();assert.ok(footer&&footer.y>=0&&footer.y+footer.height<=480);await p.screenshot({path:out+`/mac-${theme}-compact.png`});assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS teammate profile: engine/skills, create/edit/reopen, both themes, compact footer.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
