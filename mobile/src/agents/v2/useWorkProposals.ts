import {useEffect,useRef,useState} from 'react';
import type {ProposalApi,WorkProposal} from './workProposalModel';
export function useWorkProposals(api:ProposalApi,agentId:string,runId:string|undefined,active:boolean) {
 const [items,setItems]=useState<WorkProposal[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),epoch=useRef(0),lock=useRef(false),queued=useRef(false);
 const refresh=async()=>{if(lock.current){queued.current=true;return;}lock.current=true;const version=epoch.current;setBusy(true);try{const rows=await api.list(agentId,runId);if(rows.some(p=>p.agentId!==agentId||(runId&&p.runId!==runId)))throw new Error('Proposals returned a different teammate or task.');if(version===epoch.current){setItems(rows);setError('');}}catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Proposals could not be loaded.');}finally{if(version===epoch.current){lock.current=false;setBusy(false);if(queued.current){queued.current=false;void refresh();}}}};
 useEffect(()=>{++epoch.current;lock.current=false;queued.current=false;setItems([]);setError('');void refresh();return()=>{++epoch.current;};},[api,agentId,runId]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{void refresh();if(!active)return;const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[api,agentId,runId,active]); // eslint-disable-line react-hooks/exhaustive-deps
 return {items,error,busy,refresh};
}
