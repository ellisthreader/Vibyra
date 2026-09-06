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
const measures=[];
for(const [name,expression,width,height] of [
 ['dashboard-dark','',1440,900],
 ['chat-dark',"audit.mode.setState({agentId:'agent-0',chatId:'chat-0',tab:'chats',panel:null})",1440,900],
 ['chat-minimum','',960,600],
 ['settings-light',"audit.mode.setState({tab:'settings'});document.documentElement.dataset.theme='light'",1440,900],
 ['routines-light',"audit.mode.getState().openPanel('routines')",960,600],
 ['empty-dark',"document.documentElement.dataset.theme='dark';audit.roster.setState({agents:[]});audit.mode.getState().openPanel('dashboard')",1440,900]
]){
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 if(expression)await evalJS(expression);await pause(600);
 const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${base}/${name}.png`,Buffer.from(shot.data,'base64'));
 measures.push({name,...await evalJS(`({width:innerWidth,height:innerHeight,bodyWidth:document.body.scrollWidth,text:document.body.innerText,overflow:[...document.querySelectorAll('main, .chat-surface, .composer, .agent-head')].map(n=>({class:n.className,width:n.clientWidth,scrollWidth:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight}))})`)});
}
await fs.writeFile(`${base}/ui-results.json`,JSON.stringify({measures,errors},null,2));
console.log(JSON.stringify({screenshots:measures.map(x=>x.name),errors}));socket.close();
