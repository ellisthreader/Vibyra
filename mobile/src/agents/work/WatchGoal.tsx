import {useState} from 'react';
import {View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import type {ProjectWatch,SignalsPage} from '../v2/signalsModel';
export function WatchGoal({watch,goals,disabled,save}:{watch:ProjectWatch;goals:SignalsPage['goals'];disabled:boolean;save(goalId:string|null):void}) {
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(watch.goalId??null);
 return <View style={{gap:6}}><Button secondary title="Review linked goal" onPress={()=>setOpen(!open)}/>{open&&<><Hint>Choose a goal for factual comparison. Saving enables this watch using its existing access.</Hint><Button secondary disabled={disabled} title={`${selected===null?'✓ ':''}No linked goal`} onPress={()=>setSelected(null)}/>{(goals??[]).map(g=><Button secondary key={g.id} disabled={disabled} title={`${selected===g.id?'✓ ':''}${g.title}`} onPress={()=>setSelected(g.id)}/>)}<Button secondary title="Save link & enable watch" disabled={disabled} onPress={()=>save(selected)}/></>}</View>;
}
