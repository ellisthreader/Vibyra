import {useEffect,useRef,useState} from 'react';
import {groupProblem,type AgentGroup,type GroupBody,type CoordinationApi} from './coordinationModel';
export function useGroupEditor(api:CoordinationApi,id:string,initial:AgentGroup|undefined,onSaved:(g:AgentGroup)=>void){
 const [body,setBody]=useState<GroupBody>({expectedRevision:initial?.revision??0,name:initial?.name??'',coordinatorId:initial?.coordinatorId??'',members:initial?.members.map(({agentId,handle})=>({agentId,handle}))??[]}),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),lock=useRef(false),epoch=useRef(0);
 useEffect(()=>()=>{++epoch.current;},[]);
 const mutate=async(action:'save'|'archive')=>{
  if(lock.current||unknown||(action==='archive'&&!initial))return;
  if(action==='save'){const problem=groupProblem(body);if(problem){setError(problem);return;}}
  const version=epoch.current;lock.current=true;setBusy(true);setUnknown(true);
  try{const g=action==='save'?await api.save(id,body):await api.remove({...initial!,revision:body.expectedRevision});if(g.id!==id)throw new Error('The group receipt did not match.');if(version===epoch.current){setUnknown(false);onSaved(g);}}
  catch(e){if(version===epoch.current)setError(`${e instanceof Error?e.message:'The change is unconfirmed.'} Refresh this group before changing it.`);}
  finally{if(version===epoch.current){lock.current=false;setBusy(false);}}
 };
 const refresh=async()=>{
  if(lock.current)return;const version=epoch.current;lock.current=true;setBusy(true);
  try{const g=await api.group(id);if(g.id!==id)throw new Error('The group did not match.');if(version!==epoch.current)return;setBody({expectedRevision:g.revision,name:g.name,coordinatorId:g.coordinatorId,members:g.members.map(({agentId,handle})=>({agentId,handle}))});setUnknown(false);setError('');if(g.deletedAt)onSaved(g);}
  catch(e){if(version!==epoch.current)return;const code=typeof e==='object'&&e&&'status'in e?Number(e.status):Number(/^(\d{3}):/.exec(String(e instanceof Error?e.message:e))?.[1]??0);if(code===404&&body.expectedRevision===0){setUnknown(false);setError('This group was not created. Review and save your draft.');}else setError(e instanceof Error?e.message:'Group could not be refreshed.');}
  finally{if(version===epoch.current){lock.current=false;setBusy(false);}}
 };
 const toggle=(agentId:string,name:string)=>{if(busy||unknown)return;setBody(b=>{const found=b.members.some(m=>m.agentId===agentId),members=found?b.members.filter(m=>m.agentId!==agentId):[...b.members,{agentId,handle:(name.toLowerCase().replace(/[^a-z0-9_-]/g,'').replace(/^[^a-z]+/,'')||'agent').slice(0,24)}];return {...b,members,coordinatorId:members.some(m=>m.agentId===b.coordinatorId)?b.coordinatorId:members[0]?.agentId??''};});};
 return {body,busy,unknown,error,setBody,toggle,save:()=>mutate('save'),refresh,archive:()=>mutate('archive')};
}
