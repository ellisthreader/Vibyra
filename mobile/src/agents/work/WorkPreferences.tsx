import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import {clockMinute,clockText,type SignalPreferences,type SignalMode} from '../v2/signalsModel';
export function WorkPreferences({value,disabled,save}:{value:SignalPreferences;disabled:boolean;save(p:SignalPreferences):void}) {
 const {colors}=useTheme(),[mode,setMode]=useState(value.mode),[timezone,setZone]=useState(value.timezone),[start,setStart]=useState(clockText(value.quietStart)),[end,setEnd]=useState(clockText(value.quietEnd)),[digest,setDigest]=useState(clockText(value.digestMinute)),[error,setError]=useState('');
 const field=(label:string,text:string,change:(v:string)=>void)=><View key={label}><Text style={{color:colors.text}}>{label}</Text><TextInput accessibilityLabel={label} editable={!disabled} value={text} onChangeText={change} style={{color:colors.text,borderColor:colors.border,borderWidth:1,padding:10,borderRadius:8}}/></View>;
 const submit=()=>{try{const quietStart=clockMinute(start),quietEnd=clockMinute(end),digestMinute=clockMinute(digest);if((quietStart===null)!==(quietEnd===null)||digestMinute===null)throw new Error('Enter both quiet-hour times, or clear both. Choose a daily summary time.');setError('');save({...value,mode,timezone,quietStart,quietEnd,digestMinute});}catch(e){setError((e as Error).message);}};
 return <View style={{gap:8}}><Hint>Agent notifications across your devices. Existing system permissions and category switches still apply.</Hint>{([['decisions','Decisions & blockers'],['daily','Daily summary + decisions'],['all','All progress']] as [SignalMode,string][]).map(([key,label])=><Button key={key} secondary disabled={disabled} title={`${mode===key?'✓ ':''}${label}`} onPress={()=>setMode(key)}/>)}{field('Notification timezone',timezone,setZone)}{field('Quiet hours start (HH:MM, optional)',start,setStart)}{field('Quiet hours end (HH:MM, optional)',end,setEnd)}{field('Daily summary time (HH:MM)',digest,setDigest)}{error&&<Hint error>{error}</Hint>}<Button title="Save notifications" disabled={disabled} onPress={submit}/></View>;
}
