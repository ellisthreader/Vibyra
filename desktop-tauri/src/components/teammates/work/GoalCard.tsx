import { useState } from 'react';
import { workControls,workRuntime,workStatus,type AgentGoal,type WorkControl } from '../../../../../mobile/src/agents/v2/workCoreModel';
export function GoalCard({item,disabled,act,onOpenRun}:{item:AgentGoal;disabled:boolean;act(action:WorkControl|'confirm'):void;onOpenRun?(id:string):void}) {
  const [open,setOpen]=useState(false);
  return <article className="agent-work-card"><h4>{item.title}</h4><p>{workStatus(item.status)} · {item.progress.delivered}/{item.progress.total} milestones delivered</p>
    <p className="profile-help">{workRuntime(item.runtime)} · expires {new Date(item.expiresAt).toLocaleString()}</p>
    {item.reason&&<p role="alert">{item.reason}</p>}
    <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Review milestones</summary>
      {item.milestones.map(m=><section key={m.key} className="agent-work-milestone"><h5>{m.title} · {m.status}</h5><p>{m.prompt}</p><p>Finished means: {m.successCriteria}</p>
        {m.dependsOn.length>0&&<p>After: {m.dependsOn.join(', ')}</p>}
        {m.evidence&&<><p style={{whiteSpace:'pre-wrap'}}>{m.evidence.answer}</p><p className="profile-help">{m.evidence.outputIds.length} saved outputs · {new Date(m.evidence.finishedAt).toLocaleString()}</p></>}
        {m.runId&&onOpenRun&&<button type="button" onClick={()=>onOpenRun(m.runId!)}>Open task: {m.title}</button>}
      </section>)}
    </details>
    {item.status==='awaiting_review'&&<><p>Every milestone has delivered a result. Review its evidence before confirming your goal is finished.</p><button type="button" className="primary" disabled={disabled||!open} onClick={()=>act('confirm')}>Confirm goal finished</button></>}
    <div className="agent-work-actions">{workControls(item.status).map(action=><button type="button" key={action} disabled={disabled} onClick={()=>act(action)}>{action[0].toUpperCase()+action.slice(1)} goal</button>)}</div>
    {item.status==='active'&&<p className="profile-help">Pause stops future milestones. Cancel also stops unfinished linked tasks.</p>}
  </article>;
}
