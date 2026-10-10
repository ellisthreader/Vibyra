import {useEffect,useRef,useState} from 'react';
import type {AgentWorkflow,CoordinationApi} from './coordinationModel';
import type {WorkControl} from './workCoreModel';
export function useWorkflow(api:CoordinationApi,initial:AgentWorkflow){
 const [item,setItem]=useState(initial),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);useEffect(()=>{if(!lock.current&&!unknown&&initial.revision>item.revision)setItem(initial);},[initial,unknown,item.revision]);
 const request=async(action?:WorkControl|'confirm')=>{if(lock.current||(action&&unknown))return;lock.current=true;setBusy(true);if(action)setUnknown(true);try{const next=action==='confirm'?await api.confirm(item):action?await api.control(item,action):await api.workflow(item.id);if(next.id!==item.id||next.groupId!==item.groupId)throw new Error('Workflow returned a different group.');if(alive.current){setItem(next);setUnknown(false);setError('');}}catch(e){if(alive.current)setError(`${e instanceof Error?e.message:'Workflow could not be reached.'} Refresh this workflow before changing it.`);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 return {item,busy,unknown,error,request};
}
