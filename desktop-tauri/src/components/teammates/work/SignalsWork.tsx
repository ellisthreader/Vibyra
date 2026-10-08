import {useEffect,useState,useSyncExternalStore} from 'react';
import {SignalsStore} from '../../../../../mobile/src/agents/v2/signalsStore';
import type {SignalsApi} from '../../../../../mobile/src/agents/v2/signalsModel';
import {WorkPreferences} from './WorkPreferences';
import {ProjectDiscovery} from './ProjectDiscovery';
import {WorkStarters} from './WorkStarters';
export function SignalsWork({api,agentId,active,disabled,onDraft,onDigest}:{api:SignalsApi;agentId:string;active:boolean;disabled:boolean;onDraft?(prompt:string):void;onDigest?(id:string):void}) {
 const [store]=useState(()=>new SignalsStore(api,agentId)),state=useSyncExternalStore(store.subscribe,store.snapshot);
 useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{if(active)void store.refresh();},[active,store]);
 const page=state.page,locked=disabled||state.busy||state.unknown;
 return <section className="agent-work-signals">{state.error&&<p role="alert">{state.error}</p>}
  <details><summary>Relevant starters</summary>{page&&<WorkStarters key={page.onboarding.revision} value={page.onboarding} disabled={locked} save={v=>void store.mutate(()=>api.onboarding(agentId,v))} onDraft={onDraft}/>}</details>
  <details><summary>Project discovery</summary>{page&&<ProjectDiscovery page={page} store={store} disabled={locked}/>}</details>
  <details><summary>Notifications</summary>{page&&<><WorkPreferences key={page.preferences.revision} value={page.preferences} disabled={locked} save={v=>void store.mutate(()=>api.preferences(v))}/>{page.digests.map(d=><p key={d.id}><button type="button" onClick={()=>onDigest?.(d.id)}>Daily summary · {d.date}</button></p>)}</>}</details>
  <button type="button" disabled={state.busy} onClick={()=>void store.refresh()}>Refresh suggestions & settings</button>
 </section>;
}
