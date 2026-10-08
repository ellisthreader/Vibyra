import {useState} from 'react';
import type {SignalOnboarding,SignalInterest} from '../../../../../mobile/src/agents/v2/signalsModel';
export function WorkStarters({value,disabled,save,onDraft}:{value:SignalOnboarding;disabled:boolean;save(v:SignalOnboarding):void;onDraft?(prompt:string):void}) {
 const [interests,setInterests]=useState(value.interests);
 return <section><p className="profile-help">Choose what you want help with. Suggestions use these choices and your existing access.</p>{(['code','email','meetings'] as SignalInterest[]).map(key=><label key={key}><input type="checkbox" disabled={disabled} checked={interests.includes(key)} onChange={()=>setInterests(interests.includes(key)?interests.filter(x=>x!==key):[...interests,key])}/>{key[0].toUpperCase()+key.slice(1)} </label>)}<div className="agent-work-actions"><button type="button" disabled={disabled} onClick={()=>save({...value,interests,dismissed:false})}>Find relevant starters</button></div>
  {!value.dismissed&&value.suggestions.map(s=><article className="agent-work-card" key={s.key}><h4>{s.title}</h4><p>{s.reason}</p>{s.missing.map(m=><p className="profile-help" key={m}>{m}</p>)}{s.firstTask&&<p>{s.firstTask.prompt}</p>}{s.ready&&s.firstTask&&onDraft&&<button type="button" disabled={disabled} onClick={()=>onDraft(s.firstTask!.prompt)}>Prepare: {s.title}</button>}</article>)}
  {!value.dismissed&&value.suggestions.length>0&&<button type="button" disabled={disabled} onClick={()=>save({...value,dismissed:true})}>Dismiss starter suggestions</button>}<p className="profile-help">Preparing a starter only fills a draft. Review it and press Send in the conversation.</p>
 </section>;
}
