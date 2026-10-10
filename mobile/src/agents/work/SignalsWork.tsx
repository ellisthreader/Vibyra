import {useEffect,useState,useSyncExternalStore} from 'react';
import {View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import {SignalsStore} from '../v2/signalsStore';
import type {SignalsApi} from '../v2/signalsModel';
import {WorkPreferences} from './WorkPreferences';
import {ProjectDiscovery} from './ProjectDiscovery';
import {WorkStarters} from './WorkStarters';
export function SignalsWork({api,agentId,active,disabled,onDraft,onDigest}:{api:SignalsApi;agentId:string;active:boolean;disabled:boolean;onDraft?(prompt:string):void;onDigest?(id:string):void}) {
 const [store]=useState(()=>new SignalsStore(api,agentId)),state=useSyncExternalStore(store.subscribe,store.snapshot),[section,setSection]=useState('');
 useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{if(active)void store.refresh();},[active,store]);
 const page=state.page,locked=disabled||state.busy||state.unknown;
 return <View style={{gap:10}}>{state.error&&<Hint error>{state.error}</Hint>}
  {['Relevant starters','Project discovery','Notifications'].map(name=><Button key={name} secondary title={`${section===name?'▾':'▸'} ${name}`} onPress={()=>setSection(section===name?'':name)}/>)}
  {page&&section==='Relevant starters'&&<WorkStarters key={page.onboarding.revision} value={page.onboarding} disabled={locked} save={v=>void store.mutate(()=>api.onboarding(agentId,v))} onDraft={onDraft}/>}
  {page&&section==='Project discovery'&&<ProjectDiscovery page={page} store={store} disabled={locked}/>}
  {page&&section==='Notifications'&&<><WorkPreferences key={page.preferences.revision} value={page.preferences} disabled={locked} save={v=>void store.mutate(()=>api.preferences(v))}/>{page.digests.map(d=><Button key={d.id} secondary title={`Daily summary · ${d.date}`} onPress={()=>onDigest?.(d.id)}/>)}</>}
  {(section||state.error)&&<Button secondary title="Refresh suggestions & settings" disabled={state.busy} onPress={()=>void store.refresh()}/>}
 </View>;
}
