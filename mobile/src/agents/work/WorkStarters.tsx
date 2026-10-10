import {useState} from 'react';
import {Text,View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import type {SignalOnboarding,SignalInterest} from '../v2/signalsModel';
export function WorkStarters({value,disabled,save,onDraft}:{value:SignalOnboarding;disabled:boolean;save(v:SignalOnboarding):void;onDraft?(prompt:string):void}) {
 const {colors}=useTheme(),[interests,setInterests]=useState(value.interests);
 return <View style={{gap:8}}><Hint>Choose what you want help with. Suggestions use these choices and your existing access.</Hint>{(['code','email','meetings'] as SignalInterest[]).map(key=><Button key={key} secondary disabled={disabled} title={`${interests.includes(key)?'✓ ':''}${key[0].toUpperCase()+key.slice(1)}`} onPress={()=>setInterests(interests.includes(key)?interests.filter(x=>x!==key):[...interests,key])}/>)}<Button secondary title="Find relevant starters" disabled={disabled} onPress={()=>save({...value,interests,dismissed:false})}/>
  {!value.dismissed&&value.suggestions.map(s=><View key={s.key} style={{gap:6}}><Text style={{color:colors.text,fontWeight:'600'}}>{s.title}</Text><Hint>{s.reason}</Hint>{s.missing.map(m=><Hint key={m}>{m}</Hint>)}{s.firstTask&&<Text selectable style={{color:colors.text}}>{s.firstTask.prompt}</Text>}{s.ready&&s.firstTask&&onDraft&&<Button secondary title={`Prepare: ${s.title}`} disabled={disabled} onPress={()=>onDraft(s.firstTask!.prompt)}/>}</View>)}
  {!value.dismissed&&value.suggestions.length>0&&<Button secondary title="Dismiss starter suggestions" disabled={disabled} onPress={()=>save({...value,dismissed:true})}/>}<Hint>Preparing a starter only fills a draft. Review it and press Send in the conversation.</Hint>
 </View>;
}
