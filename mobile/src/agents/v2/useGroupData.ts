import {useEffect,useRef,useState} from 'react';
import type {AgentGroup,AgentWorkflow,CoordinationApi} from './coordinationModel';
export function mergeWorkflows(current:AgentWorkflow[],incoming:AgentWorkflow[]){
 const rows=new Map(current.map(w=>[w.id,w]));
 incoming.forEach(w=>{const old=rows.get(w.id);if(!old||w.revision>=old.revision)rows.set(w.id,w);});
 return [...rows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
export function useGroupData(api:CoordinationApi,groupId:string|undefined,active:boolean){
 const [groups,setGroups]=useState<AgentGroup[]>([]),[workflows,setWorkflows]=useState<AgentWorkflow[]>([]),[error,setError]=useState(''),[cursor,setCursor]=useState<string|null>(null),[loadingMore,setLoadingMore]=useState(false);
 const epoch=useRef(0),request=useRef(0),initialized=useRef(false),moreLock=useRef(false);
 const validate=(rows:AgentWorkflow[])=>{if(rows.some(w=>w.groupId!==groupId))throw new Error('Workflows returned a different group.');};
 const refresh=async()=>{const version=epoch.current,serial=++request.current;try{
  const [rows,page]=await Promise.all([api.groups(),groupId?api.workflows(groupId):Promise.resolve({workflows:[],nextCursor:null})]);validate(page.workflows);
  if(version===epoch.current&&serial===request.current){setGroups(rows);setWorkflows(old=>mergeWorkflows(old,page.workflows));if(!initialized.current){setCursor(page.nextCursor);initialized.current=true;}setError('');}
 }catch(e){if(version===epoch.current&&serial===request.current)setError(e instanceof Error?e.message:'Groups could not be loaded.');}};
 const loadMore=async()=>{if(!groupId||!cursor||moreLock.current||!active)return;const version=epoch.current;moreLock.current=true;setLoadingMore(true);try{
  const page=await api.workflows(groupId,cursor);validate(page.workflows);if(version===epoch.current){setWorkflows(old=>mergeWorkflows(old,page.workflows));setCursor(page.nextCursor);setError('');}
 }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Earlier workflows could not be loaded.');}finally{if(version===epoch.current){moreLock.current=false;setLoadingMore(false);}}};
 useEffect(()=>{++epoch.current;initialized.current=false;moreLock.current=false;setLoadingMore(false);setCursor(null);setWorkflows([]);if(!active)return;void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{++epoch.current;clearInterval(timer);};},[api,groupId,active]); // eslint-disable-line react-hooks/exhaustive-deps
 return {groups,workflows,error,refresh,loadMore,loadingMore,hasMore:Boolean(cursor)};
}
