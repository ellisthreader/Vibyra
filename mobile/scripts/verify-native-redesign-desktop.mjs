import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const out=resolve('../output/native-redesign');await mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['../desktop-tauri/tests/nativeRedesignFixture.tsx'],bundle:true,write:false,outfile:'/tmp/redesign.js',format:'iife',jsx:'automatic',loader:{'.webp':'dataurl','.png':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},plugins:[{name:'art',setup(b){b.onLoad({filter:/\/modelArtwork\.ts$/},()=>({contents:'export const modelArtworkUrl = () => null;',loader:'ts'}));}}]});
const server=createServer(async(req,res)=>{if(req.url.includes('/assets/teammates/')){try{res.setHeader('Content-Type','image/webp');res.end(await readFile(resolve('../desktop-tauri/src/assets/teammates',req.url.split('/').at(-1))));return;}catch{res.statusCode=404;res.end();return;}}const file=bundle.outputFiles.find(f=>req.url==='/fixture.js'?f.path.endsWith('.js'):req.url==='/fixture.css'?f.path.endsWith('.css'):false);res.setHeader('Content-Type',file?(req.url.endsWith('.js')?'application/javascript':'text/css'):'text/html');res.end(file?.text??'<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const theme of ['light','dark']){const p=await browser.newPage({viewport:{width:1328,height:700}});const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await p.goto(`http://127.0.0.1:${server.address().port}/?${theme}`);await p.locator('.adaptive-pane-host .pane').last().waitFor({timeout:5000});assert.equal(await p.locator('.adaptive-pane-host').count(),6);await p.getByRole('button',{name:'Remote, No phone connected',exact:true}).click();assert.equal(await p.evaluate(()=>window.remoteSection()),'iphone');await p.evaluate(()=>window.setPhoneFixture(['phone']));await p.getByRole('button',{name:'Remote, Phone connected',exact:true}).waitFor();await p.evaluate(()=>{window.setPhoneFixture([]);window.closeSettings();});const codeReport=p.locator('aside[aria-label="Workspace navigation"]').getByRole('button',{name:'Report a problem'});assert.ok(await codeReport.isVisible(),'Code report entry is visible');await codeReport.click();await p.waitForFunction(()=>window.reportEntryState().area==='Terminal pane');assert.deepEqual(await p.evaluate(()=>window.reportEntryState()),{open:true,area:'Terminal pane',view:'terminals',project:'Vibyra'});await p.evaluate(()=>window.resetReportEntry());await p.screenshot({path:out+`/desktop-code-${theme}.png`});await p.getByRole('tab',{name:'Agents',exact:true}).click();await p.locator('.teammate-row').first().click();await p.locator('.teammate-bubble.them').waitFor();const agentReport=p.locator('aside[aria-label="Teammates navigation"]').getByRole('button',{name:'Report a problem'});assert.ok(await agentReport.isVisible(),'Agents report entry is visible');await agentReport.click();await p.waitForFunction(()=>window.reportEntryState().area==='Teammates');assert.deepEqual(await p.evaluate(()=>window.reportEntryState()),{open:true,area:'Teammates',view:'teammates',project:null});await p.evaluate(()=>window.resetReportEntry());await p.screenshot({path:out+`/desktop-agents-${theme}.png`});await p.getByRole('tab',{name:'Code',exact:true}).click();assert.equal(await p.locator('.adaptive-pane-host').count(),6);await p.getByRole('button',{name:'Expand terminal',exact:true}).first().click();assert.equal(await p.locator('.adaptive-max .pane:visible').count(),1);await p.getByRole('button',{name:'Restore grid',exact:true}).click();assert.equal(await p.locator('.adaptive-grid .pane:visible').count(),6);assert.deepEqual(errors,[]);await p.close();}for(const count of [1,2,3,4,5,6,7,10,20]) {
 const p=await browser.newPage({viewport:{width:1328,height:700}});await p.goto(`http://127.0.0.1:${server.address().port}/?light&count=${count}`);
 await p.locator('.adaptive-pane-host .pane').last().waitFor();assert.equal(await p.locator('.adaptive-pane-host').count(),count);
 await p.evaluate(()=>{window.originalPaneHosts=[...document.querySelectorAll('.adaptive-pane-host')];});
 await p.getByRole('button',{name:'Expand terminal',exact:true}).first().click();
 await p.getByRole('button',{name:'Restore grid',exact:true}).click();
 assert.equal(await p.evaluate(()=>window.originalPaneHosts.every(el=>el.isConnected)),true,'maximise must preserve pane DOM hosts');
 assert.equal(await p.locator('.adaptive-grid').evaluate(el=>el.scrollWidth>el.clientWidth || el.scrollHeight>el.clientHeight),false,'all panes fit without stage scrolling');
 if(count>2){
  const lane=p.locator('.adaptive-grid');
  const geometry=()=>lane.locator('.adaptive-pane-host').evaluateAll(els=>els.map(el=>({left:el.offsetLeft,top:el.offsetTop,width:el.clientWidth,height:el.clientHeight})));
  const before=await geometry();
  await lane.locator('.pane__title').nth(1).click();
  assert.deepEqual(await geometry(),before,'focus must not move or resize any pane');
  assert.ok(before.every(g=>Math.abs(g.height-before[0].height)<=1),'balanced row heights');
  const fullWidth=await lane.evaluate(el=>el.clientWidth);
  for(const top of new Set(before.map(g=>g.top))){const row=before.filter(g=>g.top===top);assert.ok(Math.abs(row.reduce((sum,g)=>sum+g.width,0)+8*(row.length-1)-fullWidth)<=row.length,'every row fills available width');}
  assert.ok(new Set(before.map(g=>g.top)).size>1,'multiple rows for many terminals');
 }
 await p.setViewportSize({width:960,height:640});
 await p.waitForTimeout(100);
 assert.equal(await p.locator('.adaptive-grid').evaluate(el=>el.scrollWidth>el.clientWidth || el.scrollHeight>el.clientHeight),false,'narrow windows retain every pane');
 await p.setViewportSize({width:1328,height:700});
 await p.waitForTimeout(100);
 await p.screenshot({path:out+`/desktop-${count}-panes.png`});await p.close();
}
{
 const p=await browser.newPage({viewport:{width:1328,height:700}});await p.goto(`http://127.0.0.1:${server.address().port}/?light&send-timeout`);
 await p.getByRole('tab',{name:'Agents',exact:true}).click();await p.locator('.teammate-row').first().click();
 await p.getByRole('button',{name:'Dictate message',exact:true}).click();await p.getByRole('button',{name:'Finish dictation',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.teammate-composer textarea').value==='Dictated draft.');
 assert.equal(await p.evaluate(()=>window.redesignRequests.filter(r=>r.path==='terminal_write').length),0,'teammate dictation must never write to a hidden Code terminal');
 await p.getByRole('textbox',{name:'Message On-call engineer',exact:true}).fill('Please inspect the proposed change.');
 await p.getByRole('button',{name:'Prepare message',exact:true}).click();await p.getByRole('button',{name:'Send message',exact:true}).click();
 await p.getByRole('button',{name:'Retry original send',exact:true}).waitFor();
 assert.equal(await p.getByRole('textbox',{name:'Message On-call engineer',exact:true}).isDisabled(),true);
 await p.getByRole('button',{name:'Retry original send',exact:true}).click();
 await p.waitForFunction(()=>window.redesignRequests.filter(r=>r.path==='vibes/turns').length===2);
 const sends=await p.evaluate(()=>window.redesignRequests.filter(r=>r.path==='vibes/turns').map(r=>r.body));assert.deepEqual(sends[0],sends[1],'ambiguous retry must preserve both ID and quote');await p.close();
}
{
 const p=await browser.newPage({viewport:{width:1328,height:700}});await p.goto(`http://127.0.0.1:${server.address().port}/?light&empty`);
 await p.getByRole('main').getByRole('button',{name:'Open a folder',exact:true}).waitFor();assert.equal(await p.locator('.adaptive-pane-host').count(),0);
 await p.screenshot({path:out+'/desktop-empty-light.png'});await p.close();
}
{
 const p=await browser.newPage({viewport:{width:1328,height:700}});await p.goto(`http://127.0.0.1:${server.address().port}/?dark&tree`);
 const project=p.getByRole('button',{name:'Vibyra 6',exact:true});
 await project.waitFor(); await p.getByRole('button',{name:'Collapse sessions for Vibyra'}).click();
 assert.equal(await p.locator('.workspace-tree__sessions .pstrip__row').count(),0);
 await project.click();
 assert.equal(await p.evaluate(()=>window.projectView()),'home','clicking the selected project returns Home');
 assert.equal(await project.getAttribute('class').then(value=>value.includes('is-active')),false,'Home clears the selected project highlight');
 const api=p.getByRole('button',{name:'vibyra-api 1',exact:true});await api.click();
 assert.equal(await p.evaluate(()=>window.projectView()),'project','an already expanded project opens on one click');
 await p.getByRole('button',{name:'Expand sessions for Vibyra'}).click();
 assert.equal(await p.locator('.workspace-tree__sessions .pstrip__row').count(),7);
 await p.locator('.workspace-tree__sessions').getByRole('button',{name:'zsh',exact:false}).click();
 await p.getByRole('button',{name:'Collapse sessions for vibyra-api'}).click();
 assert.equal(await p.locator('.workspace-tree__sessions .pstrip__row').count(),6);
 await p.getByRole('button',{name:'Expand sessions for vibyra-api'}).click();
 await p.locator('aside[aria-label="Workspace navigation"] .pstrip__scroll').evaluate(element=>element.click());
 assert.equal(await p.evaluate(()=>window.projectView()),'home','clicking blank sidebar space leaves a project');
 assert.equal(await p.getByRole('button',{name:'Home',exact:true}).count(),0,'there is no Home tab');
 assert.equal(await p.locator('.workspace-tree__add').count(),0,'project rows carry no hover +');
 const empty=p.getByRole('button',{name:'vibyra-website',exact:true});await empty.click();
 assert.equal(await p.evaluate(()=>window.projectView()),'project','empty projects open on one click');
 assert.equal(await p.getByRole('button',{name:'Expand sessions for vibyra-website'}).count(),0,'empty projects have no disclosure control');
 assert.equal(await p.locator('[aria-label="New terminal in vibyra-website"]').count(),0,'empty projects never show a nested New terminal action');
 for(const name of ['Vibyra','vibyra-api']){
  const kids=await p.locator('section',{has:p.locator(`[aria-label="New terminal in ${name}"]`)}).locator('.workspace-tree__sessions > *').evaluateAll(els=>els.map(el=>el.className));
  assert.ok(kids.at(-1).includes('workspace-tree__new'),`${name}: New terminal is the last row under an open project`);
 }
 await p.screenshot({path:out+'/desktop-workspace-tree-dark.png'});
 assert.equal(await p.evaluate(()=>window.agentPicker()),false);
 await p.locator('[aria-label="New terminal in vibyra-api"]').click();
 assert.equal(await p.evaluate(()=>window.agentPicker()),true,'New terminal opens that project launcher');
 await p.close();
}
{
 const p=await browser.newPage({viewport:{width:1100,height:720}});await p.goto(`http://127.0.0.1:${server.address().port}/?light&tree`);
 assert.equal(await p.getByRole('button',{name:'Test intro'}).count(),0,'development intro control is absent');
 const website=p.getByRole('button',{name:'vibyra-website',exact:true});await website.click({button:'right'});
 const actions=p.getByRole('dialog',{name:'Project actions for vibyra-website'});await actions.getByRole('button',{name:'Rename project'}).click();
 await p.screenshot({path:out+'/desktop-project-rename.png'});
 await actions.getByRole('textbox',{name:'Project name'}).fill('Client website');
 await actions.getByRole('button',{name:'Save name'}).click();
 await p.getByRole('button',{name:'Client website',exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.redesignRequests.filter(r=>r.path==='save_settings').at(-1).body.settings.projects.find(p=>p.id==='website').name),'Client website','rename persists to settings backend');
 assert.equal(await p.evaluate(()=>window.agentPicker()),false);
 await p.getByRole('button',{name:'vibyra-api 1',exact:true}).click({button:'right'});
 const apiActions=p.getByRole('dialog',{name:'Project actions for vibyra-api'});
 await apiActions.getByRole('button',{name:'Close project'}).click();
 assert.match(await apiActions.innerText(),/1 open session will close/);
 await p.screenshot({path:out+'/desktop-project-close.png'});
 await apiActions.getByRole('button',{name:'Cancel'}).click();
 assert.equal(await p.getByRole('button',{name:'vibyra-api 1',exact:true}).count(),1,'cancel preserves project');
 await apiActions.getByRole('button',{name:'Close project'}).click();
 await apiActions.getByRole('button',{name:'Close project'}).click();
 await p.getByRole('button',{name:'vibyra-api 1',exact:true}).waitFor({state:'detached'});
 assert.equal(await p.locator('.adaptive-pane-host').count(),6,'closing removes only that project session');
 assert.equal(await p.evaluate(()=>window.redesignRequests.some(r=>r.path==='shared_chat_remove_project'&&r.body.projectId==='api')),true,'close tells the native backend to stop project chats');
 assert.equal(await p.evaluate(()=>window.redesignRequests.filter(r=>r.path==='save_settings').at(-1).body.settings.projects.some(p=>p.id==='api')),false,'close persists removal');
 const stageWidth=await p.locator('.project-workspace').evaluate(el=>el.getBoundingClientRect().width);
 await p.getByRole('button',{name:'Hide projects sidebar'}).click();
 await p.screenshot({path:out+'/desktop-projects-hidden.png'});
 assert.equal(await p.locator('.pstrip.focus-rail').isVisible(),false);
 assert.ok(await p.locator('.project-workspace').evaluate(el=>el.getBoundingClientRect().width)>stageWidth,'workspace grows when sidebar closes');
 await p.reload();
 assert.equal(await p.locator('.pstrip.focus-rail').isVisible(),false,'sidebar preference survives reload');
 await p.getByRole('button',{name:'Show projects sidebar'}).click();
 assert.equal(await p.locator('.pstrip.focus-rail').isVisible(),true);
 await p.screenshot({path:out+'/desktop-project-actions.png'});await p.close();
}
{
 const p=await browser.newPage({viewport:{width:1100,height:720}});await p.goto(`http://127.0.0.1:${server.address().port}/?dark&tree`);
 await p.getByRole('button',{name:'Vibyra 6',exact:true}).click({button:'right'});
 const actions=p.getByRole('dialog',{name:'Project actions for Vibyra'});
 await actions.getByRole('button',{name:'Close project'}).click();
 assert.match(await actions.innerText(),/6 open sessions will close/);
 await actions.getByRole('button',{name:'Close project'}).click();
 await p.getByRole('button',{name:'Vibyra 6',exact:true}).waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>window.projectView()),'home','closing the active project returns Home');
 assert.equal(await p.evaluate(()=>window.workspaceRoot()),'/','closing the active project releases its watched root');
 assert.equal(await p.locator('.adaptive-pane-host').count(),0,'active project terminals are closed');
 assert.equal(await p.getByRole('button',{name:'vibyra-api 1',exact:true}).count(),1,'other projects remain available');
 await p.close();
}
console.log('PASS native components: project rename/close persistence, sidebar visibility, modes, preserved hosts, dictation, exact send recovery, and 1–20 terminal layouts.');}finally{await browser.close();server.close();}
