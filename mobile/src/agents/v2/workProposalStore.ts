import type {ProposalApi,WorkProposal} from './workProposalModel';
interface Snapshot {item:WorkProposal;busy:boolean;unknown:boolean;error:string;editing:boolean;spec:WorkProposal['spec']}
/** A displayed draft's revision/hash remain the sole activation authority. */
export class WorkProposalStore {
 private listeners=new Set<()=>void>();private epoch=0;private lock=false;private value:Snapshot;
 constructor(private api:ProposalApi,item:WorkProposal){this.value={item,busy:false,unknown:false,error:'',editing:false,spec:item.spec};}
 snapshot=()=>this.value;subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private update(p:Partial<Snapshot>){this.value={...this.value,...p};this.listeners.forEach(f=>f());}
 dispose=()=>{this.epoch++;this.listeners.clear();};
 edit=(spec:WorkProposal['spec'])=>{if(!this.lock&&!this.value.unknown&&this.value.item.status==='draft')this.update({spec,editing:true});};
 cancelEdit=()=>{if(!this.lock&&!this.value.unknown)this.update({spec:this.value.item.spec,editing:false});};
 private validate(item:WorkProposal){const old=this.value.item;if(item.id!==old.id||item.agentId!==old.agentId||item.runId!==old.runId||item.runtimeId!==old.runtimeId)throw new Error('Proposal returned a different task or account.');}
 private request=async(operation:()=>Promise<WorkProposal>,write:boolean)=>{
  if(this.lock||(write&&this.value.unknown))return;this.lock=true;const version=this.epoch;this.update({busy:true,error:'',...(write?{unknown:true}:{})});
  try{const item=await operation();this.validate(item);if(version===this.epoch)this.update({item,spec:item.spec,editing:false,unknown:false});}
  catch(e){if(version===this.epoch)this.update({error:`${e instanceof Error?e.message:'Proposal could not be reached.'} Refresh this proposal before changing it again.`});}
  finally{if(version===this.epoch){this.lock=false;this.update({busy:false});}}
 };
 refresh=()=>this.request(()=>this.api.get(this.value.item.id),false);
 save=()=>this.request(()=>this.api.edit(this.value.item,this.value.spec),true);
 discard=()=>this.request(()=>this.api.discard(this.value.item),true);
 accept=()=>{
  if(this.value.editing)return Promise.resolve();const shown=this.value.item;
  return this.request(async()=>{const current=await this.api.get(shown.id);this.validate(current);if(current.reviewHash!==shown.reviewHash||current.revision!==shown.revision||current.status!=='draft')throw new Error('This proposal changed. Review its latest version.');return this.api.accept(shown);},true);
 };
}
