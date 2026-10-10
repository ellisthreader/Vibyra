import { Text,View } from 'react-native';
import { Button,Hint } from '../../ui/primitives';
import { useTheme } from '../../theme';
import { followUpWhen,workControls,workRuntime,workStatus,type AgentFollowUp,type WorkControl } from '../v2/workCoreModel';
export function FollowUpCard({item,disabled,act,onOpenRun}:{item:AgentFollowUp;disabled:boolean;act(action:WorkControl):void;onOpenRun?(id:string):void}) {
  const {colors}=useTheme();
  return <View style={{gap:8,paddingVertical:14,borderBottomWidth:1,borderColor:colors.border}}>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:17,fontWeight:'600'}}>{item.title}</Text>
    <Hint>{workStatus(item.status)} · {followUpWhen(item.condition)}</Hint><Text selectable style={{color:colors.text}}>{item.prompt}</Text>
    <Hint>{workRuntime(item.runtime)} · expires {new Date(item.expiresAt).toLocaleString()}</Hint>
    {item.condition.kind==='absence'&&<Hint>This checks verified events received by Vibyra, not the entire external inbox.</Hint>}
    {item.reason&&<Hint error>{item.reason}</Hint>}
    {item.runId&&onOpenRun&&<Button secondary title="Open follow-up task" onPress={()=>onOpenRun(item.runId!)}/>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{workControls(item.status).map(action=><Button key={action} secondary title={`${action[0].toUpperCase()+action.slice(1)} follow-up`} disabled={disabled} onPress={()=>act(action)}/>)}</View>
  </View>;
}
