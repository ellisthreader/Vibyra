import type {SignalsApi,SignalsPage} from './signalsModel';
interface Snapshot {page:SignalsPage|null;busy:boolean;unknown:boolean;error:string}
export class SignalsStore {
 private listeners=new Set<()=>void>();private epoch=0;private lock=false;private value:Snapshot={page:null,busy:false,unknown:false,error:''};
 constructor(readonly api:SignalsApi,readonly agentId:string){}
 snapshot=()=>this.value;subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private update(p:Partial<Snapshot>){this.value={...this.value,...p};this.listeners.forEach(f=>f());}
 dispose=()=>{this.epoch++;this.listeners.clear();};
 private read=async()=>{const page=await this.api.read(this.agentId);if(page.watches.some(w=>w.agentId!==this.agentId)||page.findings.some(f=>f.agentId!==this.agentId))throw new Error('Suggestions returned a different teammate.');return page;};
 private request=async(operation?:()=>Promise<unknown>)=>{
  if(this.lock||(operation&&this.value.unknown))return;this.lock=true;const version=this.epoch;this.update({busy:true,error:'',...(operation?{unknown:true}:{})});
  try{if(operation)await operation();const page=await this.read();if(version===this.epoch)this.update({page,unknown:false});}
  catch(e){if(version===this.epoch)this.update({unknown:true,error:`${e instanceof Error?e.message:'Suggestions could not be reached.'} Refresh to check the saved settings.`});}
  finally{if(version===this.epoch){this.lock=false;this.update({busy:false});}}
 };
 refresh=()=>this.request();mutate=(operation:()=>Promise<unknown>)=>this.request(operation);
}
