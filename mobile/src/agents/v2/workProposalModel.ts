import {workflowReview} from './workflowReview';
import type {WorkflowSpec} from './coordinationModel';
import type { WorkRuntime,FollowUpCondition,FollowUpSource } from './workCoreModel';
import type { ScheduleBody } from './routinesModel';
export interface GoalSpec { title:string; expiresAt:string; milestones:{key:string;title:string;prompt:string;successCriteria:string;dependsOn:string[]}[] }
export interface FollowUpSpec { title:string;expiresAt:string;prompt:string;condition:FollowUpCondition }
export type RoutineSpec=Omit<ScheduleBody,'agentId'|'runtimeId'|'title'>&{title:string;catchUpMinutes?:number;overlap?:'skip'|'queue'};
export interface SkillSpec {name:string;instructions:string;assignToAgent:boolean}
interface Base { id:string;agentId:string;runId:string;runtimeId:string;runtime:WorkRuntime;title:string;revision:number;reviewHash:string;status:'draft'|'accepted'|'discarded'|'expired';expiresAt:string;activation:null|{kind:string;id:string};createdAt:string;updatedAt:string }
export type WorkProposal=Base&({kind:'goal';spec:GoalSpec}|{kind:'followup';spec:FollowUpSpec}|{kind:'routine';spec:RoutineSpec}|{kind:'skill';spec:SkillSpec}|{kind:'workflow';spec:WorkflowSpec});
export interface ProposalApi {list(agentId:string,runId?:string):Promise<WorkProposal[]>;get(id:string):Promise<WorkProposal>;edit(item:WorkProposal,spec:WorkProposal['spec']):Promise<WorkProposal>;accept(item:WorkProposal):Promise<WorkProposal>;discard(item:WorkProposal):Promise<WorkProposal>}
export function proposalReview(item:WorkProposal):{label:string;text:string}[] {
 const rows:{label:string;text:string}[]=[];const add=(label:string,text:unknown)=>rows.push({label,text:String(text??'')});
 add('Selected account',item.runtime.accountLabel??item.runtime.provider);add('Account reference',item.runtime.accountId??item.runtime.accountRef);
 const spec=item.spec;
 if(item.kind==='workflow')rows.push(...workflowReview(item.spec,item.runtime.coordination));
 if(item.kind==='goal') {const s=spec as GoalSpec;add('Title',s.title);add('Work expires',s.expiresAt);s.milestones.forEach((m,i)=>{add(`Milestone ${i+1}`,m.title);add('Task',m.prompt);add('Finished means',m.successCriteria);add('After',m.dependsOn.map(k=>s.milestones.find(x=>x.key===k)?.title??k).join(', ')||'No dependencies');});}
 if(item.kind==='followup') {const s=spec as FollowUpSpec;add('Title',s.title);add('Task',s.prompt);add('Work expires',s.expiresAt);add('Condition',s.condition.kind);if('at'in s.condition)add('When',s.condition.at);if('subject'in s.condition){add('Exact subject',s.condition.subject);add('Source revision',s.condition.triggerRevision);}}
 if(item.kind==='routine') {const s=spec as RoutineSpec;add('Title',s.title);add('Task',s.prompt);add('Timezone',s.timezone);for(const [k,v]of Object.entries(s.recurrence))add(k,Array.isArray(v)?v.join(', '):v);add('Catch-up minutes',s.catchUpMinutes??0);add('Overlap',s.overlap??'skip');}
 if(item.kind==='skill') {const s=spec as SkillSpec;add('Skill',s.name);add('Instructions',s.instructions);add('Assign to this teammate',s.assignToAgent?'Yes':'No');}
 return rows;
}

export function proposalSource(item:WorkProposal,sources:FollowUpSource[]):FollowUpSource|null {
 if(item.kind!=='followup'||item.spec.condition.kind==='time')return null;
 const c=item.spec.condition;
 return sources.find(s=>s.healthy&&s.triggerId===c.triggerId&&s.triggerRevision===c.triggerRevision&&s.subjects.some(x=>x.subject===c.subject))??null;
}
export const proposalNeedsSource=(item:WorkProposal)=>item.kind==='followup'&&item.spec.condition.kind!=='time';
