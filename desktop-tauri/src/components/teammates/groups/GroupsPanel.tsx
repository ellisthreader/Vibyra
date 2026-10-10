import {useState} from 'react';
import {stageFiveClient} from '../../../../../mobile/src/agents/v2/stageFiveClient';
import {stageFourClient} from '../../../../../mobile/src/agents/v2/stageFourClient';
import {stageTwoClient} from '../../../../../mobile/src/agents/v2/stageTwoModel';
import {useGroupData} from '../../../../../mobile/src/agents/v2/useGroupData';
import {teammateApi} from '../api';
import type {Teammate} from '../types';
import {GroupEditor} from './GroupEditor';
import {GroupChat} from './GroupChat';
const api=stageFiveClient(teammateApi),work=stageFourClient(teammateApi),outputs=stageTwoClient(teammateApi);
export function GroupsPanel({teammates,identity,active,disabled,onClose,onOpenRun}:{teammates:Teammate[];identity:string;active:boolean;disabled:boolean;onClose():void;onOpenRun(agentId:string,id:string):void}){
 const [selected,setSelected]=useState<string>(),[editing,setEditing]=useState<string>(),state=useGroupData(api.coordination,selected,active),group=state.groups.find(g=>g.id===selected);
 return <section className="agent-groups-panel" role="dialog" aria-modal="true" aria-label="Agent groups"><header><h2>Agent groups</h2><button type="button" disabled={Boolean(editing)} onClick={onClose}>Close groups</button></header>{state.error&&<p role="alert">{state.error}</p>}<button type="button" onClick={()=>void state.refresh()}>Refresh groups</button>{editing?<GroupEditor key={editing} api={api.coordination} id={editing} initial={state.groups.find(g=>g.id===editing)} teammates={teammates} disabled={disabled} onSaved={g=>{setEditing(undefined);setSelected(g.id);void state.refresh();}} onClose={()=>setEditing(undefined)}/>:<><nav aria-label="Agent groups">{state.groups.map(g=><button type="button" key={g.id} aria-pressed={selected===g.id} onClick={()=>setSelected(g.id)}>{g.name}{g.deletedAt?' · archived':''}</button>)}<button type="button" disabled={disabled} onClick={()=>setEditing(crypto.randomUUID())}>New group</button></nav>{group&&<><h3>{group.name}</h3><button type="button" disabled={disabled||Boolean(group.deletedAt)} onClick={()=>setEditing(group.id)}>Edit group members</button><GroupChat key={`${identity}:${group.id}`} api={api} work={work} outputs={outputs} group={group} identity={identity} active={active} disabled={disabled} workflows={state.workflows} onChanged={()=>void state.refresh()} onOpenRun={onOpenRun}/>{state.hasMore&&<button type="button" disabled={state.loadingMore} onClick={()=>void state.loadMore()}>Load earlier workflows</button>}</>}</>}</section>;
}
