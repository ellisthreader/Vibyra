import { followUpWhen,workControls,workRuntime,workStatus,type AgentFollowUp,type WorkControl } from '../../../../../mobile/src/agents/v2/workCoreModel';
export function FollowUpCard({item,disabled,act,onOpenRun}:{item:AgentFollowUp;disabled:boolean;act(action:WorkControl):void;onOpenRun?(id:string):void}) {
  return <article className="agent-work-card"><h4>{item.title}</h4><p>{workStatus(item.status)} · {followUpWhen(item.condition)}</p><p>{item.prompt}</p>
    <p className="profile-help">{workRuntime(item.runtime)} · expires {new Date(item.expiresAt).toLocaleString()}</p>
    {item.condition.kind==='absence'&&<p className="profile-help">This checks verified events received by Vibyra, not the entire external inbox.</p>}
    {item.reason&&<p role="alert">{item.reason}</p>}
    {item.runId&&onOpenRun&&<button type="button" onClick={()=>onOpenRun(item.runId!)}>Open follow-up task</button>}
    <div className="agent-work-actions">{workControls(item.status).map(action=><button type="button" key={action} disabled={disabled} onClick={()=>act(action)}>{action[0].toUpperCase()+action.slice(1)} follow-up</button>)}</div>
  </article>;
}
