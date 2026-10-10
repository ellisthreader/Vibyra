import {useEffect,useRef,useState} from 'react';
import type {StageFiveApi} from './stageFiveClient';
import type {Run} from './runCore';
export function usePlanningRun(api:StageFiveApi,id:string,agentId:string,active:boolean){
 const [run,setRun]=useState<Run|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),epoch=useRef(0),lock=useRef(false),terminal=useRef(false);
 const refresh=async()=>{const version=epoch.current;try{const r=await api.run(id);if(r.id!==id||r.agentId!==agentId)throw new Error('The task returned a different group member.');if(version===epoch.current){terminal.current=r.terminal;setRun(r);setUnknown(false);setError('');}}catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'The planning task could not be loaded.');}};
 useEffect(()=>{++epoch.current;terminal.current=false;lock.current=false;setBusy(false);setRun(null);setUnknown(false);void refresh();const timer=active?setInterval(()=>{if(!terminal.current)void refresh();},4000):null;return()=>{++epoch.current;if(timer)clearInterval(timer);};},[api,id,agentId,active]); // eslint-disable-line react-hooks/exhaustive-deps
 const cancel=async()=>{if(lock.current||unknown||!run||run.terminal)return;lock.current=true;const version=epoch.current;setBusy(true);setUnknown(true);try{await api.jobs.cancel(id);if(version===epoch.current)await refresh();}catch(e){if(version===epoch.current)setError(`${e instanceof Error?e.message:'Cancellation is unconfirmed.'} Refresh this task before trying again.`);}finally{if(version===epoch.current){lock.current=false;setBusy(false);}}};
 return {run,error,busy,unknown,refresh,cancel};
}
