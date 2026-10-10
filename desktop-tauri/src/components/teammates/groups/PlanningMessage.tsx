import type {StageFiveApi} from '../../../../../mobile/src/agents/v2/stageFiveClient';
import type {StageFourApi} from '../../../../../mobile/src/agents/v2/stageFourClient';
import type {GroupMessage} from '../../../../../mobile/src/agents/v2/coordinationModel';
import {usePlanningRun} from '../../../../../mobile/src/agents/v2/usePlanningRun';
import {Proposals} from '../work/Proposals';
export function PlanningMessage({api,work,message:m,active,disabled,onChanged,onOpenRun}:{api:StageFiveApi;work:StageFourApi;message:GroupMessage;active:boolean;disabled:boolean;onChanged():void;onOpenRun(agentId:string,id:string):void}){
 const s=usePlanningRun(api,m.planningRunId,m.coordinatorId,active);
 return <article className="agent-work-card"><p style={{whiteSpace:'pre-wrap'}}>{m.prompt}</p><p>Coordinator planning · {s.run?.state.replaceAll('_',' ')??'Loading'} · group version {m.groupRevision}</p>{s.error&&<p role="alert">{s.error}</p>}{s.run?.stateReason&&<p>{s.run.stateReason}</p>}{s.run?.answer&&<p style={{whiteSpace:'pre-wrap'}}>{s.run.answer}</p>}<div className="agent-work-actions"><button type="button" onClick={()=>onOpenRun(m.coordinatorId,m.planningRunId)}>Open planning task & receipts</button>{s.run&&!s.run.terminal&&<button type="button" disabled={disabled||s.busy||s.unknown} onClick={()=>void s.cancel()}>Cancel planning task</button>}{s.unknown&&<button type="button" onClick={()=>void s.refresh()}>Refresh planning task</button>}</div><Proposals api={work} agentId={m.coordinatorId} runId={m.planningRunId} active={active&&!s.run?.terminal} disabled={disabled} onChanged={onChanged}/></article>;
}
