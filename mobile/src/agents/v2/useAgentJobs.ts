import {useEffect,useRef,useState} from 'react';
import {checkedJobs,type JobsApi,type JobsPage} from './jobsModel';
export function useAgentJobs(api:JobsApi|undefined,agentId:string|undefined,active:boolean){
 const [page,setPage]=useState<JobsPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),epoch=useRef(0),lock=useRef(false);
 const refresh=async()=>{if(!api||lock.current)return;lock.current=true;const version=epoch.current;try{const next=checkedJobs(await api.list(agentId),agentId);if(version===epoch.current){setPage(next);setError('');}}catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Jobs could not be loaded.');}finally{if(version===epoch.current)lock.current=false;}};
 useEffect(()=>{++epoch.current;lock.current=false;setBusy(false);setPage(null);setError('');if(!active)return;void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>{++epoch.current;clearInterval(timer);};},[api,agentId,active]); // eslint-disable-line react-hooks/exhaustive-deps
 const cancel=async(id:string)=>{if(!api||busy||!page?.runs.some(r=>r.id===id&&!r.terminal))return;const version=epoch.current;setBusy(true);try{const run=await api.cancel(id);if(run.id!==id)throw new Error('Cancellation returned a different task.');if(version===epoch.current)await refresh();}catch(e){if(version===epoch.current)setError(`${e instanceof Error?e.message:'Cancellation is unconfirmed.'} Refresh to check this task.`);}finally{if(version===epoch.current)setBusy(false);}};
 return {page,error,busy,refresh,cancel};
}
