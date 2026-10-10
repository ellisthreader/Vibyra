import {useEffect,useState,useSyncExternalStore} from 'react';
import {Text,View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import {WorkProposalStore} from '../v2/workProposalStore';
import {proposalReview,proposalSource,proposalNeedsSource,type WorkProposal} from '../v2/workProposalModel';
import {workRuntime,type FollowUpSource} from '../v2/workCoreModel';
import type {StageFourApi} from '../v2/stageFourClient';
import {ProposalEditor} from './ProposalEditor';
export function ProposalCard({item,api,disabled,onChanged}:{item:WorkProposal;api:StageFourApi;disabled:boolean;onChanged?(kind?:string):void}) {
 const {colors}=useTheme(),[store]=useState(()=>new WorkProposalStore(api.proposals,item)),state=useSyncExternalStore(store.subscribe,store.snapshot),[review,setReview]=useState(false),[sources,setSources]=useState<FollowUpSource[]>([]),[sourceVersion,setSourceVersion]=useState(0);
 useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{let live=true;if(item.kind==='followup')void api.core.sources(item.agentId).then(x=>{if(live)setSources(x);}).catch(()=>{});return()=>{live=false;};},[api,item.agentId,item.kind,sourceVersion]);
 const locked=disabled||state.busy||state.unknown,p=state.item,source=proposalSource(p,sources),sourceMissing=proposalNeedsSource(p)&&!source;
 const action=async(kind:'save'|'accept'|'discard'|'refresh')=>{await store[kind]();setReview(kind==='save'&&!store.snapshot().unknown);if(kind==='refresh')setSourceVersion(v=>v+1);if(!store.snapshot().unknown)onChanged?.(kind==='accept'?store.snapshot().item.kind:undefined);};
 return <View style={{padding:14,gap:8,borderWidth:1,borderColor:colors.border,borderRadius:12}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontSize:17,fontWeight:'600'}}>{p.title}</Text><Hint>{p.kind} proposal · {p.status}</Hint><Hint>{workRuntime(p.runtime)}</Hint>
  {state.error&&<Hint error>{state.error}</Hint>}
  {proposalNeedsSource(p)&&<Hint>{source?`Verified source: ${source.title}`:'Choose a current verified source before saving.'}</Hint>}
  {p.status==='draft'&&<Hint>Review before saving. This proposal has not started any work or granted access.</Hint>}
  {state.editing?<ProposalEditor item={p} value={state.spec} change={store.edit} disabled={locked} sources={sources}/>:<><Button secondary title={review?'Hide full review':'Review proposal'} onPress={()=>setReview(!review)}/>{review&&proposalReview(p).map((r,i)=><View key={i}><Hint>{r.label}</Hint><Text selectable style={{color:colors.text}}>{r.text}</Text></View>)}</>}
  {p.status==='draft'&&<View style={{gap:8}}>{state.editing?<><Button title="Save edits & review" disabled={locked} onPress={()=>void action('save')}/><Button secondary title="Cancel edits" disabled={locked} onPress={store.cancelEdit}/></>:<><Button title={p.kind==='routine'?'Save routine':p.kind==='skill'?'Save skill':p.kind==='goal'?'Start goal':'Save follow-up'} disabled={locked||!review||sourceMissing} onPress={()=>void action('accept')}/><Button secondary title="Edit proposal" disabled={locked} onPress={()=>store.edit(p.spec)}/><Button secondary title="Discard proposal" disabled={locked} onPress={()=>void action('discard')}/></>}</View>}
  {p.status==='accepted'&&<Hint>Saved once. Manage it in Work or Skills.</Hint>}<Button secondary title="Refresh proposal" disabled={state.busy} onPress={()=>void action('refresh')}/>
 </View>;
}
