// Creates paid disposable Fly VMs; run only for an explicitly authorized VM acceptance task.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(),'vibyra-preview-qa-'));
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const app='vibyra-preview-qa-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomUUID().slice(0,6),image=process.argv[2];
if(!/^registry\.fly\.io\/vibyra-cloud-runtime@sha256:[a-f0-9]{64}$/.test(image??''))throw Error('Pinned verified QA image required');
const fly=(args)=>execFileSync('fly',args,{cwd:root,encoding:'utf8',timeout:95000});
let token;try{token=fly(['auth','token']).trim();}catch{throw Error('Sign in to Fly before isolated VM QA');}
console.log('Disposable QA report directory:',dir);
const waitState=async(id,state)=>{for(let i=0;i<90;i++){const rows=JSON.parse(fly(['machine','list','--app',app,'--json']));if(rows.find(m=>m.id===id)?.state===state)return;await new Promise(r=>setTimeout(r,1000));}throw Error('QA VM did not become '+state);};
const createMachine=async(config,files,name)=>{
  config.files=files.map(([guest_path,path])=>({guest_path,raw_value:fs.readFileSync(path).toString('base64')}));
  const response=await fetch(`https://api.machines.dev/v1/apps/${app}/machines`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({name,region:'lhr',config:{...config,image}}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('QA create failed: '+response.status+' '+await response.text());
  const machine=await response.json();
  await waitState(machine.id,'started');return machine;
};
const leaseOnly=process.argv[4]==='lease-only';
const wait=ms=>new Promise(r=>setTimeout(r,ms));const report={app,image,mode:leaseOnly?'lease-only':'all',cycles:[],leaseLoss:false};let created=false;
fs.writeFileSync(dir+'/qa-vm-report.json',JSON.stringify(report,null,2));
try {
  fly(['apps','create',app,'--org','personal','--network',app,'--yes']);created=true;
  const conf={init:{exec:['/bin/sleep','900']},restart:{policy:'no'},guest:{cpu_kind:'performance',cpus:2,memory_mb:4096},services:[],metadata:{vibyra_qa_owner:app}};
  if(!leaseOnly){
  fs.writeFileSync(dir+'/qa-machine.json',JSON.stringify(conf));
  const files=['smoke.mjs','native-fixture.py','capture-input.py'].map(name=>[`/opt/qa/${name}`,`${root}/cloud-runtime/tests/preview-vm/${name}`]);
  console.log('Creating isolated VM with verified image');
  let machine=await createMachine(conf,files,'isolated-preview-qa');
  if(!machine?.id)throw Error('QA machine missing');report.machine=machine.id;
  const profiles=[...Array(4).fill([2,4096]),...Array(3).fill([2,8192]),...Array(3).fill([4,8192])];
  for(let i=0;i<profiles.length;i++) {
    const [cpus,memory]=profiles[i];
    if(i){fly(['machine','update',machine.id,'--app',app,'--vm-cpu-kind','performance','--vm-cpus',String(cpus),'--vm-memory',String(memory),'--yes']);fly(['machine','start',machine.id,'--app',app]);await waitState(machine.id,'started');}
    const inspected=JSON.parse(fly(['machine','list','--app',app,'--json'])).find(m=>m.id===machine.id);
    if(inspected.config.guest.cpus !== cpus || inspected.config.guest.memory_mb !== memory)throw Error('QA guest resources mismatch');
    console.log('Checking cold start',i+1,'resources',cpus,memory);
    const began=Date.now();const output=fly(['machine','exec',machine.id,'node /opt/qa/smoke.mjs','--app',app,'--timeout','60']);
    if(!output.includes('PASS 5 native'))throw Error('Incomplete actual VM acceptance: '+output);
    report.cycles.push({coldStart:i+1,cpus,memoryMb:memory,passed:true,durationMs:Date.now()-began});
    fs.writeFileSync(dir+'/qa-vm-report.json',JSON.stringify(report,null,2));console.log('PASS cold start',i+1,'profile',cpus,memory,'five native/website/quota cycles');
    fly(['machine','stop',machine.id,'--app',app]);await waitState(machine.id,'stopped');
  }
  }
  // The actual production entrypoint must stop its VM after signed authority expires.
  const keys=generateKeyPairSync('ed25519');fs.writeFileSync(dir+'/qa-issuer.pem',keys.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=Vibyra isolated QA','-addext','subjectAltName=IP:127.0.0.1',
    '-keyout',dir+'/qa-tls-key.pem','-out',dir+'/qa-tls-cert.pem'],{stdio:'ignore'});
  fs.chmodSync(dir+'/qa-tls-key.pem',0o600);
  const env={VIBYRA_API_ORIGIN:'https://127.0.0.1:9393',NODE_EXTRA_CA_CERTS:'/opt/qa/tls-cert.pem',VIBYRA_WORKSPACE_ID:randomUUID(),VIBYRA_GENERATION:'1',VIBYRA_BOOTSTRAP:'synthetic',VIBYRA_LEASE_PUBLIC_KEY:publicKey};
  const lossConf={...conf,env,init:{exec:['/bin/sh','-c','node /opt/qa/lease-server.mjs & exec /opt/vibyra/entrypoint.sh']}};
  fs.writeFileSync(dir+'/qa-lease-machine.json',JSON.stringify(lossConf));
  const lossMachine=await createMachine(lossConf,[['/opt/qa/lease-server.mjs',`${root}/cloud-runtime/tests/preview-vm/lease-server.mjs`],['/opt/qa/issuer.pem',dir+'/qa-issuer.pem'],
    ['/opt/qa/tls-key.pem',dir+'/qa-tls-key.pem'],['/opt/qa/tls-cert.pem',dir+'/qa-tls-cert.pem']],'lease-expiry-qa');report.leaseMachine=lossMachine.id;
  let stopped=false;for(let i=0;i<30;i++){await wait(2000);const machines=JSON.parse(fly(['machine','list','--app',app,'--json']));if(machines.find(m=>m.id===lossMachine.id)?.state==='stopped'){stopped=true;break;}}
  if(!stopped)throw Error('Actual production VM failed to stop after loss of signed leases');
  const logs=fly(['logs','--app',app,'--no-tail']);
  fs.writeFileSync(dir+'/qa-lease.log',logs);
  if((logs.match(/LEASE_EXPIRY/g)??[]).length<2)throw Error('No proof that the production runtime received two signed leases');
  report.leaseLoss=true;console.log('PASS actual production VM stops after synthetic signed lease loss');
}finally {
  let cleanupFailed=false;
  try {if(created){fly(['apps','destroy',app,'--yes']);report.cleaned=true;}}
  catch {report.cleaned=false;cleanupFailed=true;}
  finally {
    fs.writeFileSync(dir+'/qa-vm-report.json',JSON.stringify(report,null,2));
    for(const name of ['qa-issuer.pem','qa-tls-key.pem','qa-tls-cert.pem'])fs.rmSync(dir+'/'+name,{force:true});
  }
  if(cleanupFailed)throw Error('QA cleanup failed. Destroy only the recorded app: '+app);
}
