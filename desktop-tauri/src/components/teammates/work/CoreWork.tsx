import { useEffect,useState,useSyncExternalStore } from 'react';
import { WorkCoreStore } from '../../../../../mobile/src/agents/v2/workCoreStore';
import type { WorkCoreApi } from '../../../../../mobile/src/agents/v2/workCoreModel';
import { GoalCard } from './GoalCard';
import { FollowUpCard } from './FollowUpCard';
export function CoreWork({api,agentId,active,disabled,onOpenRun,refreshVersion=0}:{api:WorkCoreApi;agentId:string;active:boolean;disabled:boolean;onOpenRun?(id:string):void;refreshVersion?:number}) {
  const [store]=useState(()=>new WorkCoreStore(api,agentId)),state=useSyncExternalStore(store.subscribe,store.snapshot);
  useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{if(active)void store.refresh();},[active,store,refreshVersion]);
  const locked=disabled||state.busy||state.loading||state.unknown;
  return <div className="agent-work-core">{state.error&&<p role="alert">{state.error}</p>}<button type="button" disabled={state.loading||state.busy} onClick={()=>void store.refresh()}>{state.loading?'Refreshing…':'Refresh Work'}</button>
    <h3>Goals</h3>{!state.goals.length&&<p className="profile-help">Ask this teammate to plan a goal with milestones. Review its proposal before work begins.</p>}
    {state.goals.map(item=><GoalCard key={`${item.id}:${item.revision}`} item={item} disabled={locked} act={action=>void store.goal(item,action)} onOpenRun={onOpenRun}/>)}
    <h3>Follow-ups</h3>{!state.followups.length&&<p className="profile-help">Ask for a timed reminder or a follow-up on a verified event. Each proposal needs your review.</p>}
    {state.followups.map(item=><FollowUpCard key={`${item.id}:${item.revision}`} item={item} disabled={locked} act={action=>void store.followup(item,action)} onOpenRun={onOpenRun}/>)}
  </div>;
}
