import {useEffect,useState} from 'react';
import type {StageFiveApi} from './stageFiveClient';
import type {StageTwoApi} from './stageTwoModel';
import type {AgentOutput} from './outputModel';
import type {AgentGroup} from './coordinationModel';
export interface GroupRuntime {id:string;revision:number;executionTarget:'local'|'cloud';provider:string;accountRef:string;accountLabel?:string;model:string;effort:string|null;online:boolean;capabilities:{controlledTools?:boolean;parallelJobsV1?:boolean}}
export const groupRuntimeLabel=(r:GroupRuntime)=>`${r.executionTarget==='cloud'?'Cloud':'My computer'} · ${r.accountLabel??(r.executionTarget==='cloud'?'Claude Cloud account':r.accountRef)} · ${r.model}${r.online?'':' · offline'}`;
export function useGroupResources(api:StageFiveApi,outputs:StageTwoApi|undefined,group:AgentGroup){
 const [runtimes,setRuntimes]=useState<GroupRuntime[]>([]),[files,setFiles]=useState<AgentOutput[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let alive=true;void Promise.all([api.runtimes(),outputs?Promise.all(group.members.map(m=>outputs.outputs(m.agentId))):Promise.resolve([])]).then(([rows,pages])=>{if(!alive)return;setRuntimes(rows);setFiles([...new Map(pages.flat().filter(f=>group.members.some(m=>m.agentId===f.agentId)).map(f=>[`${f.id}:${f.revision}`,f])).values()]);setError('');}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Group context could not be loaded.');});return()=>{alive=false;};},[api,outputs,group.id,group.revision,revision]); // eslint-disable-line react-hooks/exhaustive-deps
 return {runtimes,files,error,refresh:()=>setRevision(v=>v+1)};
}
