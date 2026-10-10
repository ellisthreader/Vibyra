import {WatchGoal} from './WatchGoal';
import {useState} from 'react';
import {Linking,Text,TextInput,View} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {Button,Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import {findingLink,findingEvidence,goalContextText,type SignalsPage} from '../v2/signalsModel';
import type {SignalsStore} from '../v2/signalsStore';
export function ProjectDiscovery({page,store,disabled}:{page:SignalsPage;store:SignalsStore;disabled:boolean}) {
 const {colors}=useTheme(),[id,setId]=useState(randomUUID),[connection,setConnection]=useState(''),[repository,setRepository]=useState(''),[goalId,setGoalId]=useState<string|null>(null);
 const watch=async()=>{await store.mutate(()=>store.api.watch({id,revision:0,agentId:store.agentId,connectionId:connection,repository,goalId,enabled:true}));if(!store.snapshot().unknown&&!store.snapshot().error){setId(randomUUID());setRepository('');}};
 return <View style={{gap:10}}><Hint>Opt into one exact GitHub repository. Discovery reads pull-request status using this teammate’s existing access; findings never start work.</Hint>
  {page.watches.map(w=><View key={w.id} style={{gap:6}}><Text style={{color:colors.text,fontWeight:'600'}}>{w.repository} · {w.status}</Text><Hint>{w.coverage}</Hint>{w.goalContext&&<Hint>{goalContextText(w.goalContext)}</Hint>}{w.error&&<Hint error>Access changed or the last check failed. Review this watch before resuming.</Hint>}<Button secondary title={w.enabled?'Pause project watch':'Review & resume watch'} disabled={disabled||(!w.enabled&&!page.enabled)} onPress={()=>void store.mutate(()=>store.api.watch({...w,enabled:!w.enabled}))}/><WatchGoal key={`${w.id}:${w.revision}`} watch={w} goals={page.goals} disabled={disabled||!page.enabled} save={goalId=>void store.mutate(()=>store.api.watch({...w,goalId,enabled:true}))}/></View>)}
  {page.connections.filter(c=>c.readGranted).map(c=><Button key={c.id} secondary title={`${connection===c.id?'✓ ':''}${c.account}`} disabled={disabled} onPress={()=>setConnection(c.id)}/>)}
  {!page.connections.some(c=>c.readGranted)&&<Hint>Connect GitHub and allow this teammate to read pull requests in Access first.</Hint>}
  <TextInput accessibilityLabel="GitHub repository to watch" placeholder="owner/repository" placeholderTextColor={colors.muted} value={repository} onChangeText={setRepository} editable={!disabled} autoCapitalize="none" style={{color:colors.text,borderColor:colors.border,borderWidth:1,padding:10,borderRadius:8}}/>
  <Hint>Optionally compare changes with one of this teammate’s goals.</Hint><Button secondary disabled={disabled} title={`${goalId===null?'✓ ':''}No linked goal`} onPress={()=>setGoalId(null)}/>{(page.goals??[]).map(g=><Button key={g.id} secondary disabled={disabled} title={`${goalId===g.id?'✓ ':''}${g.title} · ${g.status}`} onPress={()=>setGoalId(g.id)}/>)}<Button title="Watch this project" disabled={disabled||!page.enabled||!connection||!/^[-\w.]+\/[-\w.]+$/.test(repository)} onPress={()=>void watch()}/>
  <Hint>The first scan records a baseline. Later changes cover the latest 30 pull requests and mergeability for up to five; coverage is partial.</Hint>
  {page.findings.map(f=><View key={f.id} style={{gap:6}}><Text style={{color:colors.text,fontWeight:'600'}}>{f.title}</Text><Hint>{f.fresh?'Verified change':'Outdated finding'} · {f.source.repository} #{f.source.number}</Hint><Text selectable style={{color:colors.text}}>Before: {findingEvidence(f.evidence.before)}{ '\n'}After: {findingEvidence(f.evidence.after)}</Text>{f.goalContext&&<Hint>{goalContextText(f.goalContext)}</Hint>}<Hint>Observed {new Date(f.observedAt).toLocaleString()} · source updated {new Date(f.sourceUpdatedAt).toLocaleString()}</Hint>{findingLink(f)&&<Button secondary title="View source pull request" onPress={()=>void Linking.openURL(findingLink(f)!)}/>}<Button secondary title="Dismiss finding" disabled={disabled} onPress={()=>void store.mutate(()=>store.api.dismiss(f.id))}/></View>)}
 </View>;
}
