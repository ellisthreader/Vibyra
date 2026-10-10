import { useState } from 'react';
import { Text,View } from 'react-native';
import { Button,Hint } from '../../ui/primitives';
import { useTheme } from '../../theme';
import { workControls,workRuntime,workStatus,type AgentGoal,type WorkControl } from '../v2/workCoreModel';
export function GoalCard({item,disabled,act,onOpenRun}:{item:AgentGoal;disabled:boolean;act(action:WorkControl|'confirm'):void;onOpenRun?(id:string):void}) {
  const {colors}=useTheme(),[open,setOpen]=useState(false);
  return <View style={{gap:8,paddingVertical:14,borderBottomWidth:1,borderColor:colors.border}}>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:17,fontWeight:'600'}}>{item.title}</Text>
    <Hint>{workStatus(item.status)} · {item.progress.delivered}/{item.progress.total} milestones delivered</Hint>
    <Hint>{workRuntime(item.runtime)} · expires {new Date(item.expiresAt).toLocaleString()}</Hint>
    {item.reason&&<Hint error>{item.reason}</Hint>}
    <Button secondary title={open?'Hide milestones':'Review milestones'} onPress={()=>setOpen(!open)}/>
    {open&&item.milestones.map(m=><View key={m.key} style={{gap:5,padding:10,borderWidth:1,borderColor:colors.border,borderRadius:10}}>
      <Text style={{color:colors.text,fontWeight:'600'}}>{m.title} · {m.status}</Text><Hint>{m.prompt}</Hint><Hint>Finished means: {m.successCriteria}</Hint>
      {m.dependsOn.length>0&&<Hint>After: {m.dependsOn.join(', ')}</Hint>}
      {m.evidence&&<><Text selectable style={{color:colors.text}}>{m.evidence.answer}</Text><Hint>{m.evidence.outputIds.length} saved outputs · {new Date(m.evidence.finishedAt).toLocaleString()}</Hint></>}
      {m.runId&&onOpenRun&&<Button secondary title={`Open task: ${m.title}`} onPress={()=>onOpenRun(m.runId!)}/>}
    </View>)}
    {item.status==='awaiting_review'&&<><Hint>Every milestone has delivered a result. Review its evidence before confirming your goal is finished.</Hint><Button title="Confirm goal finished" disabled={disabled||!open} onPress={()=>act('confirm')}/></>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{workControls(item.status).map(action=><Button key={action} secondary title={`${action[0].toUpperCase()+action.slice(1)} goal`} disabled={disabled} onPress={()=>act(action)}/>)}</View>
    {item.status==='active'&&<Hint>Pause stops future milestones. Cancel also stops unfinished linked tasks.</Hint>}
  </View>;
}
