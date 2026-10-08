// A synthetic issuer for the lease-loss test; never connects to Vibyra accounts.
import https from 'node:https';
import {createPrivateKey,sign} from 'node:crypto';
import fs from 'node:fs';
const key=createPrivateKey(fs.readFileSync('/opt/qa/issuer.pem'));
const began=Date.now();let beats=0;
https.createServer({key:fs.readFileSync('/opt/qa/tls-key.pem'),cert:fs.readFileSync('/opt/qa/tls-cert.pem')},async(q,r)=>{
  let body='';for await(const chunk of q) body+=chunk;
  const send=(code,data)=>{r.writeHead(code,{'content-type':'application/json'});r.end(JSON.stringify({ok:code<300,...data}));};
  if(q.url.endsWith('/bootstrap')) return send(200,{mode:'computer',token:'synthetic-runtime-token-no-account',limits:{},preview:{enabled:true,native:true},project:{files:[],base:[]},source:{type:'computer'}});
  if(q.url.endsWith('/heartbeat')) {
    if(beats++ >= 2)return send(503,{error:'Synthetic issuer outage'});
    const p=Buffer.from(JSON.stringify({workspace:process.env.VIBYRA_WORKSPACE_ID,machine:process.env.FLY_MACHINE_ID,generation:Number(process.env.VIBYRA_GENERATION),state:'ready',expires:Math.floor(Date.now()/1000)+10,network:{day:new Date().toISOString().slice(0,10),bytes:2097152}})).toString('base64');
    console.log('LEASE_EXPIRY',Math.floor(Date.now()/1000)+10);
    return send(200,{stop:false,lease:{payload:p,signature:sign(null,Buffer.from(p),key).toString('base64')}});
  }
  return send(404,{error:'No account data in QA'});
}).listen(9393,'127.0.0.1');
setTimeout(()=>process.exit(1),90000).unref();
