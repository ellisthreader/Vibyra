import {useState} from 'react';
import type {ProjectWatch,SignalsPage} from '../../../../../mobile/src/agents/v2/signalsModel';
export function WatchGoal({watch,goals,disabled,save}:{watch:ProjectWatch;goals:SignalsPage['goals'];disabled:boolean;save(goalId:string|null):void}) {
 const [selected,setSelected]=useState(watch.goalId??null);
 return <details><summary>Review linked goal</summary><p>Choose a goal for factual comparison. Saving enables this watch using its existing access.</p><label className="agent-work-field">Linked goal<select disabled={disabled} value={selected??''} onChange={e=>setSelected(e.target.value||null)}><option value="">No linked goal</option>{(goals??[]).map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label><button type="button" disabled={disabled} onClick={()=>save(selected)}>Save link & enable watch</button></details>;
}
