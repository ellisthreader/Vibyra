export interface WorkRuntime { coordination?:import('./workflowReview').CoordinationReview; accountLabel?:string; id?: string; bindingId?: string; executionTarget?: 'local'|'cloud'; provider?: string; accountId?: string; accountRef?: string; model?: string; effort?: string; computerName?: string }
export interface WorkBase { id:string; agentId:string; title:string; revision:number; reason:string|null; runtimeId:string; runtime:WorkRuntime; expiresAt:string; createdAt:string; updatedAt:string }
export interface WorkEvidence { runId:string; answer:string; outputIds:string[]; finishedAt:string }
export interface GoalMilestone { key:string; title:string; prompt:string; successCriteria:string; dependsOn:string[]; status:'pending'|'running'|'delivered'|'blocked'; runId:string|null; evidence:WorkEvidence|null }
export interface AgentGoal extends WorkBase { status:'active'|'paused'|'blocked'|'awaiting_review'|'completed'|'cancelled'|'expired'; milestones:GoalMilestone[]; progress:{delivered:number;total:number} }
export type FollowUpCondition = {kind:'time';at:string}|{kind:'event';triggerId:string;triggerRevision:number;subject:string}|{kind:'absence';triggerId:string;triggerRevision:number;subject:string;at:string};
export interface AgentFollowUp extends WorkBase { status:'active'|'paused'|'blocked'|'admitted'|'completed'|'cancelled'|'expired'|'satisfied'; prompt:string; condition:FollowUpCondition; runId:string|null; eventId:string|null; evidence:WorkEvidence|null }
export interface FollowUpSource { triggerId:string; triggerRevision:number; kind:string; title:string; healthy:boolean; subjects:{subject:string;label:string}[] }
export type WorkControl = 'pause'|'resume'|'cancel';
export interface WorkCoreApi {
  goals(agentId:string):Promise<AgentGoal[]>; goal(id:string):Promise<AgentGoal>;
  controlGoal(item:AgentGoal,action:WorkControl):Promise<AgentGoal>; confirmGoal(item:AgentGoal):Promise<AgentGoal>;
  followups(agentId:string):Promise<AgentFollowUp[]>; followup(id:string):Promise<AgentFollowUp>;
  controlFollowup(item:AgentFollowUp,action:WorkControl):Promise<AgentFollowUp>; sources(agentId:string):Promise<FollowUpSource[]>;
}
export const workStatus = (status:string) => ({awaiting_review:'Ready for your review',active:'Active',paused:'Paused',blocked:'Blocked',admitted:'Task started',completed:'Completed',cancelled:'Cancelled',expired:'Expired',satisfied:'Reply received · reminder not needed'}[status]??status);
export function workControls(status:string):WorkControl[] {
  if (['completed','cancelled','expired','satisfied'].includes(status)) return [];
  return status==='paused'?['resume','cancel']:status==='active'?['pause','cancel']:['cancel'];
}
export function followUpWhen(condition:FollowUpCondition):string {
  if(condition.kind==='time') return `Once on ${new Date(condition.at).toLocaleString()}`;
  const source=`${condition.subject}`;
  return condition.kind==='event'?`When the next verified event arrives for ${source}`:`If no matching verified event arrives for ${source} by ${new Date(condition.at).toLocaleString()}`;
}
export function workRuntime(runtime:WorkRuntime):string {
  return [runtime.executionTarget==='cloud'?'Cloud':'My computer',runtime.accountLabel??runtime.provider,runtime.model,runtime.effort].filter(Boolean).join(' · ');
}
export function ownedWork<T extends WorkBase>(items:T[],agentId:string):T[] {
  if(!Array.isArray(items)||items.some(x=>!x||x.agentId!==agentId||!x.id||!Number.isInteger(x.revision))) throw new Error('Work returned a different teammate. Refresh before continuing.');
  return items;
}
