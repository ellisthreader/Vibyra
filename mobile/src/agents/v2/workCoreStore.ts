import { ownedWork, type AgentGoal, type AgentFollowUp, type WorkControl, type WorkCoreApi } from './workCoreModel';
interface Snapshot { goals:AgentGoal[]; followups:AgentFollowUp[]; loading:boolean; busy:boolean; unknown:boolean; error:string }
const message=(e:unknown)=>e instanceof Error?e.message:'Work could not be reached.';
/** Scoped to one mounted owner/teammate. Uncertain mutations require a fresh read. */
export class WorkCoreStore {
  private listeners=new Set<()=>void>(); private epoch=0; private lock=false;
  private value:Snapshot={goals:[],followups:[],loading:false,busy:false,unknown:false,error:''};
  constructor(private api:WorkCoreApi,private agentId:string){}
  snapshot=()=>this.value;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private update(patch:Partial<Snapshot>){this.value={...this.value,...patch};this.listeners.forEach(fn=>fn());}
  dispose=()=>{this.epoch++;this.listeners.clear();this.lock=false;};
  refresh=async()=>{
    if(this.lock)return;this.lock=true;const version=this.epoch;this.update({loading:true,error:''});
    try {
      const [goals,followups]=await Promise.all([this.api.goals(this.agentId),this.api.followups(this.agentId)]);
      const next={goals:ownedWork(goals,this.agentId),followups:ownedWork(followups,this.agentId)};
      if(version===this.epoch)this.update({...next,unknown:false});
    }catch(e){if(version===this.epoch)this.update({error:message(e)});}
    finally{if(version===this.epoch){this.lock=false;this.update({loading:false});}}
  };
  private change=async(operation:()=>Promise<AgentGoal|AgentFollowUp>,kind:'goals'|'followups',id:string)=>{
    if(this.lock||this.value.unknown)return;this.lock=true;const version=this.epoch;this.update({busy:true,unknown:true,error:''});
    try{
      const item=await operation();ownedWork([item],this.agentId);if(item.id!==id)throw new Error('Work returned a different item.');
      if(version===this.epoch)this.update({[kind]:this.value[kind].map(x=>x.id===id?item:x),unknown:false});
    }catch(e){if(version===this.epoch)this.update({error:`${message(e)} Refresh Work to check the saved state before changing it again.`});}
    finally{if(version===this.epoch){this.lock=false;this.update({busy:false});}}
  };
  goal=(item:AgentGoal,action:WorkControl|'confirm')=>this.change(()=>action==='confirm'?this.api.confirmGoal(item):this.api.controlGoal(item,action),'goals',item.id);
  followup=(item:AgentFollowUp,action:WorkControl)=>this.change(()=>this.api.controlFollowup(item,action),'followups',item.id);
}
