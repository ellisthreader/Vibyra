import fs from 'node:fs/promises';
const base='/tmp/vibyra-agent-audit-20260904';
const tabs=await (await fetch('http://127.0.0.1:18748/json')).json();
const socket=new WebSocket(tabs[0].webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let n=0;const waiting=new Map();const errors=[];
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const t=waiting.get(m.id);waiting.delete(m.id);m.error?t?.reject(m.error):t?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params);});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;waiting.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'http://127.0.0.1:18747'});await pause(3000); for(let i=0;i<30;i++){if(await evalJS('!!window.audit'))break;await pause(1000);} if(!await evalJS('!!window.audit')){console.log(JSON.stringify({errors}));socket.close();process.exit(1);}

await evalJS("audit.mode.setState({agentId:'agent-0',chatId:'chat-0',tab:'chats',panel:null}); audit.chat.setState({send:async(...args)=>{window.auditSent=args;}})");await pause(300);
await evalJS(`(()=>{const n=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'Private draft for first chat');n.dispatchEvent(new Event('input',{bubbles:true}));const s=document.querySelector('.permission-picker select')||[...document.querySelectorAll('select')].find(n=>[...n.options].some(o=>o.value==='full'));s.value='full';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await pause(100);await evalJS("audit.mode.setState({chatId:'chat-1'})");await pause(200);
const switched=await evalJS(`({chatId:audit.mode.getState().chatId,draft:document.querySelector('textarea').value,selects:[...document.querySelectorAll('select')].map(n=>n.value)})`);
await evalJS("audit.roster.setState({agents:audit.agents.map(a=>a.id==='agent-0'?{...a,permission:'plan'}:a)})");await pause(200);
const planCeiling=await evalJS(`({profile:audit.roster.getState().agents[0].permission,selects:[...document.querySelectorAll('select')].map(n=>({value:n.value,options:[...n.options].map(o=>({value:o.value,disabled:o.disabled}))}))})`);
await evalJS(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}))`);await pause(200);
const ime=await evalJS(`({sendCalled:!!window.auditSent,sent:window.auditSent,draft:document.querySelector('textarea').value})`);
const results={switched,planCeiling,ime,errors};await fs.writeFile(base+'/ui-interaction-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));socket.close();
