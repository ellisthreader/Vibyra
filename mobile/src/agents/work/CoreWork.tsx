import { useEffect,useState,useSyncExternalStore } from 'react';
import { Text,View } from 'react-native';
import { Button,Hint } from '../../ui/primitives';
import { useTheme } from '../../theme';
import { WorkCoreStore } from '../v2/workCoreStore';
import type { WorkCoreApi } from '../v2/workCoreModel';
import { GoalCard } from './GoalCard';
import { FollowUpCard } from './FollowUpCard';
export function CoreWork({api,agentId,active,disabled,onOpenRun,refreshVersion=0}:{api:WorkCoreApi;agentId:string;active:boolean;disabled:boolean;onOpenRun?(id:string):void;refreshVersion?:number}) {
  const {colors}=useTheme(),[store]=useState(()=>new WorkCoreStore(api,agentId)),state=useSyncExternalStore(store.subscribe,store.snapshot);
  useEffect(()=>()=>store.dispose(),[store]);useEffect(()=>{if(active)void store.refresh();},[active,store,refreshVersion]);
  const locked=disabled||state.busy||state.loading||state.unknown;
  return <View style={{gap:10}}>
    {state.error&&<Hint error>{state.error}</Hint>}<Button secondary title="Refresh Work" busy={state.loading} disabled={state.busy} onPress={()=>void store.refresh()}/>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'600'}}>Goals</Text>
    {!state.goals.length&&<Hint>Ask this teammate to plan a goal with milestones. Review its proposal before work begins.</Hint>}
    {state.goals.map(item=><GoalCard key={`${item.id}:${item.revision}`} item={item} disabled={locked} act={action=>void store.goal(item,action)} onOpenRun={onOpenRun}/>)}
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'600'}}>Follow-ups</Text>
    {!state.followups.length&&<Hint>Ask for a timed reminder or a follow-up on a verified event. Each proposal needs your review.</Hint>}
    {state.followups.map(item=><FollowUpCard key={`${item.id}:${item.revision}`} item={item} disabled={locked} act={action=>void store.followup(item,action)} onOpenRun={onOpenRun}/>)}
  </View>;
}
