import type { StageTwoCall } from './stageTwoModel';
import type { AgentGoal, AgentFollowUp, FollowUpSource, WorkCoreApi } from './workCoreModel';
const enc=encodeURIComponent;
export function workCoreClient(call:StageTwoCall):WorkCoreApi {
  return {
    goals:async agent=>(await call<{goals:AgentGoal[]}>(`agents/v2/goals?agentId=${enc(agent)}`)).goals,
    goal:async id=>(await call<{goal:AgentGoal}>(`agents/v2/goals/${enc(id)}`)).goal,
    controlGoal:async(item,action)=>(await call<{goal:AgentGoal}>(`agents/v2/goals/${enc(item.id)}/control`,{revision:item.revision,action})).goal,
    confirmGoal:async item=>(await call<{goal:AgentGoal}>(`agents/v2/goals/${enc(item.id)}/confirm`,{revision:item.revision})).goal,
    followups:async agent=>(await call<{followups:AgentFollowUp[]}>(`agents/v2/followups?agentId=${enc(agent)}`)).followups,
    followup:async id=>(await call<{followup:AgentFollowUp}>(`agents/v2/followups/${enc(id)}`)).followup,
    controlFollowup:async(item,action)=>(await call<{followup:AgentFollowUp}>(`agents/v2/followups/${enc(item.id)}/control`,{revision:item.revision,action})).followup,
    sources:async agent=>(await call<{sources:FollowUpSource[]}>(`agents/v2/followups/sources?agentId=${enc(agent)}`)).sources,
  };
}
