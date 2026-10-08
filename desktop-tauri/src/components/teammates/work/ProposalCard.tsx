import {useEffect,useState,useSyncExternalStore} from 'react';
import {WorkProposalStore} from '../../../../../mobile/src/agents/v2/workProposalStore';
import {proposalReview,proposalSource,proposalNeedsSource,type WorkProposal} from '../../../../../mobile/src/agents/v2/workProposalModel';
import {workRuntime,type FollowUpSource} from '../../../../../mobile/src/agents/v2/workCoreModel';
import type {StageFourApi} from '../../../../../mobile/src/agents/v2/stageFourClient';
import {ProposalEditor} from './ProposalEditor';
export function ProposalCard({item,api,disabled,onChanged}:{item:WorkProposal;api:StageFourApi;disabled:boolean;onChanged?(kind?:string):void}) {
 const [store]=useState(()=>new WorkProposalStore(api.proposals,item)),state=useSyncExternalStore(store.subscribe,store.snapshot),[review,setReview]=useState(false),[sources,setSources]=useState<FollowUpSource[]>([]),[sourceVersion,setSourceVersion]=useState(0);
 useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{let live=true;if(item.kind==='followup')void api.core.sources(item.agentId).then(x=>{if(live)setSources(x);}).catch(()=>{});return()=>{live=false;};},[api,item.agentId,item.kind,sourceVersion]);
 const locked=disabled||state.busy||state.unknown,p=state.item,source=proposalSource(p,sources),sourceMissing=proposalNeedsSource(p)&&!source;
 const action=async(kind:'save'|'accept'|'discard'|'refresh')=>{await store[kind]();setReview(kind==='save'&&!store.snapshot().unknown);if(kind==='refresh')setSourceVersion(v=>v+1);if(!store.snapshot().unknown)onChanged?.(kind==='accept'?store.snapshot().item.kind:undefined);};
 return <article className="agent-work-card"><h4>{p.title}</h4><p>{p.kind} proposal · {p.status}</p><p className="profile-help">{workRuntime(p.runtime)}</p>
  {state.error&&<p role="alert">{state.error}</p>}{p.status==='draft'&&<p className="profile-help">Review before saving. This proposal has not started any work or granted access.</p>}
  {state.editing?<ProposalEditor item={p} value={state.spec} change={store.edit} disabled={locked} sources={sources}/>:<details open={review} onToggle={e=>setReview(e.currentTarget.open)}><summary>Review proposal</summary>{proposalReview(p).map((r,i)=><div key={i}><strong>{r.label}</strong><p style={{whiteSpace:'pre-wrap'}}>{r.text}</p></div>)}</details>}
  {proposalNeedsSource(p)&&<p className="profile-help">{source?`Verified source: ${source.title}`:'Choose a current verified source before saving.'}</p>}
  {p.status==='draft'&&<div className="agent-work-actions">{state.editing?<><button type="button" disabled={locked} onClick={()=>void action('save')}>Save edits & review</button><button type="button" disabled={locked} onClick={store.cancelEdit}>Cancel edits</button></>:<><button type="button" className="primary" disabled={locked||!review||sourceMissing} onClick={()=>void action('accept')}>{p.kind==='routine'?'Save routine':p.kind==='skill'?'Save skill':p.kind==='goal'?'Start goal':'Save follow-up'}</button><button type="button" disabled={locked} onClick={()=>store.edit(p.spec)}>Edit proposal</button><button type="button" disabled={locked} onClick={()=>void action('discard')}>Discard proposal</button></>}</div>}
  {p.status==='accepted'&&<p className="profile-help">Saved once. Manage it in Work or Skills.</p>}<button type="button" disabled={state.busy} onClick={()=>void action('refresh')}>Refresh proposal</button>
 </article>;
}
