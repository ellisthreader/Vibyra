import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const require = createRequire(new URL('../../mobile/package.json', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../output/remote-security', import.meta.url));
mkdirSync(output, { recursive: true });
const bundle = await require('esbuild').build({ absWorkingDir: root, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  stdin: { loader: 'tsx', resolveDir: root, contents: `
    import {createRoot} from 'react-dom/client';
    import {SettingsRemoteSecurity} from './src/components/settings/SettingsRemoteSecurity';
    import {RemoteSecurityMonitor} from './src/components/phone/RemoteSecurityMonitor';
    import {useRemoteSecurity} from './src/state/remoteSecurityStore';
    window.store=useRemoteSecurity;
    createRoot(document.getElementById('root')).render(<><main className="shell modal-backdrop"><section className="modal settings-modal settings-modal--tiles"><div className="settings-pane"><header className="settings-pane__header"><h1 className="settings-pane__title">Remote access</h1></header><div className="settings-pane__body"><SettingsRemoteSecurity/></div></div></section></main><RemoteSecurityMonitor/></>);
  ` }, plugins: [{ name: 'synthetic-native-security', setup(build) {
    build.onLoad({ filter: /src\/state\/accountStore\.ts$/ }, () => ({loader:'js',contents:`
      import {create} from 'zustand'; export const useAccountStore=create(()=>({snapshot:{profile:{welcomeKey:'account-a'}}})); window.account=useAccountStore;` }));
    build.onLoad({ filter: /src\/state\/phoneStore\.ts$/ }, () => ({loader:'js',contents:`
      import {create} from 'zustand'; export const usePhoneStore=create(()=>({status:{enabled:true,remote:{enabled:true},devices:[],active:[],pending:[]},configure:async()=>{},setRemote:async()=>{},disconnectDevice:async(id)=>{window.nearbyDisconnected=id;usePhoneStore.setState(state=>({status:{...state.status,active:state.status.active.filter(key=>key!==id)}}));}})); window.phone=usePhoneStore;` }));
    build.onLoad({ filter: /src\/state\/workspaceStore\.ts$/ }, () => ({loader:'js',contents:`export const useWorkspaceStore={getState:()=>({openSettingsSection(){}})};` }));
    build.onLoad({ filter: /src\/ipc\/remoteSecurity\.ts$/ }, args => ({loader:'ts',contents:readFileSync(args.path,'utf8').replace("import { invoke } from '@tauri-apps/api/core';", 'const invoke = window.fakeInvoke;') }));
    build.onLoad({ filter: /\.css$/ }, () => ({loader:'js',contents:''}));
  }}] });
const css = [...readFileSync(`${root}/src/main.tsx`,'utf8').matchAll(/import "(\.\/styles\/[^"\n]+\.css)";/g)]
  .map(([, path]) => readFileSync(`${root}/src/${path.slice(2)}`,'utf8')).join('\n') + readFileSync(`${root}/src/styles/remote-security.css`,'utf8');
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for (const theme of ['light','dark']) {
    const page = await browser.newPage({viewport:{width:1100,height:900}});
    await page.setContent(`<style>${css}</style><div id="root" class="app" data-theme="${theme}"></div>`);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = document.querySelector('#root').dataset.theme;
      const device = {id:'device-1',hostId:'host-a',publicKey:'key-a',pairingCode:'472831',deviceName:"Ellis’s iPhone",permissions:['screen:view','keyboard:control'],lastIp:'192.0.2.2',approvedAt:null,revokedAt:null};
      window.data = {scope:{accountScope:'account-a',hostId:'host-a'},security:{mode:'ask',enabled:true},pendingDevices:[device],pendingSessions:[],devices:[device],sessions:[],events:[]};
      window.calls=[];
      window.fakeInvoke=async(command,args)=>{
        window.calls.push({command,args});
        if(command==='remote_security_snapshot') return structuredClone(window.data);
        if(command==='remote_security_decide_device') {window.data.pendingDevices=[];window.data.devices[0].approvedAt=new Date().toISOString();}
        if(command==='remote_security_decide_session') window.data.pendingSessions=[];
        if(command==='remote_security_set_mode') window.data.security.mode=args.mode;
        if(command==='remote_security_disable_all') {
          window.data.security={mode:'disabled',enabled:false};
          window.phone.setState(state=>({status:{...state.status,enabled:false,remote:{enabled:false}}}));
        }
      };
    });
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('button',{name:'Deny',exact:true}).getAttribute('class'), await page.getByRole('button',{name:'Approve',exact:true}).getAttribute('class'));
    await page.getByText('472 831').waitFor();
    await page.screenshot({path:`${output}/desktop-pairing-${theme}.png`});
    await page.getByRole('button',{name:'Approve',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.command==='remote_security_decide_device').args), {
      scope:{accountScope:'account-a',hostId:'host-a'},decision:{id:'device-1',publicKey:'key-a',pairingCode:'472831',permissions:['screen:view','keyboard:control'],approve:true},
    });
    await page.evaluate(async()=>{window.data.pendingSessions=[{id:'session-a',publicKey:'key-a',clientName:"Ellis’s iPhone",permissions:['screen:view'],requestedAt:new Date().toISOString()}];await window.store.getState().refresh();});
    await page.getByRole('button',{name:'Allow',exact:true}).waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.calls.find(c=>c.command==='remote_security_decide_session').args.decision.allow), false);
    await page.getByRole('button',{name:'Revoke',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.command==='remote_security_revoke').args), {
      scope:{accountScope:'account-a',hostId:'host-a'},kind:'device',id:'device-1',target:{hostId:'host-a',publicKey:'key-a'},
    });
    await page.getByRole('combobox',{name:'Remote access mode'}).selectOption('trusted');
    await page.evaluate(()=>window.phone.setState(state=>({status:{...state.status,securitySyncPending:true}})));
    await page.getByText('Nearby connections require approval while security settings are being checked.').waitFor();
    await page.evaluate(()=>window.phone.setState(state=>({status:{...state.status,securitySyncPending:false}})));
    await page.getByText('New devices always need approval on this computer.').waitFor();
    await page.evaluate(()=>window.phone.setState(state=>({status:{...state.status,devices:[{id:'key-a',name:'Ellis’s iPhone',lastRoute:'nearby'}],active:['key-a']}})));
    await page.getByLabel('Active remote access').waitFor();
    const contrast = await page.getByLabel('Active remote access').evaluate(element=>{
      const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255)
        .map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
      const style=getComputedStyle(element), a=luminance(style.color), b=luminance(style.backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5, `Active-session indicator must remain readable in ${theme}: ${contrast}`);
    await page.getByText('Nearby on this computer').waitFor();
    assert.equal(await page.getByText('No active sessions', {exact:true}).count(),0);
    await page.screenshot({path:`${output}/desktop-active-${theme}.png`});
    await page.locator('.settings-pane').getByRole('button',{name:'Disconnect',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.nearbyDisconnected),'key-a');
    await page.getByRole('button',{name:'Disable all',exact:true}).click();
    await page.waitForFunction(()=>window.store.getState().snapshot?.security.mode==='disabled');
    await page.screenshot({path:`${output}/desktop-security-${theme}.png`});
    // A delayed old-account response must not repopulate the new account's screen.
    await page.evaluate(async()=>{window.account.setState({snapshot:{profile:{welcomeKey:'account-b'}}});await window.store.getState().refresh();});
    await page.waitForFunction(()=>window.store.getState().snapshot===null);
    await page.close();
  }
  console.log('PASS: desktop pairing code, scope/key/permission binding, balanced actions, session denial, modes, kill switch, stale account fence; light/dark screenshots. Synthetic IPC.');
} finally {await browser.close();}
