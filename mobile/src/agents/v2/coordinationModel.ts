import type {Run} from './runCore';
import type {WorkRuntime,WorkEvidence,WorkControl} from './workCoreModel';
export interface GroupMember {agentId:string;handle:string;name:string;profileRevision:number}
export interface AgentGroup {id:string;name:string;revision:number;coordinatorId:string;members:GroupMember[];deletedAt:string|null;createdAt:string;updatedAt:string}
export interface GroupBody {expectedRevision:number;name:string;coordinatorId:string;members:{agentId:string;handle:string}[]}
export interface SharedGroupContext {text:string;outputs:{id:string;revision:number}[]}
export interface GroupMessageBody {expectedRuntimeRevision:number;expectedRevision:number;runtimeId:string;idempotencyKey:string;prompt:string;mentions:string[];sharedContext:SharedGroupContext}
export interface GroupMessage {coordinatorId:string;id:string;groupId:string;groupRevision:number;prompt:string;mentions:string[];sharedContext:SharedGroupContext;runtime:WorkRuntime;createdAt:string;planningRunId:string}
export interface WorkflowStepSpec {key:string;agentId:string;title:string;prompt:string;successCriteria:string;dependsOn:string[]}
export interface WorkflowSpec {title:string;expiresAt:string;steps:WorkflowStepSpec[];finalCriteria:string;groupId:string;groupRevision:number;messageId:string;prompt:string;mentions:string[];sharedContext:SharedGroupContext;members?:GroupMember[]}
export interface WorkflowStep extends WorkflowStepSpec {handle:string;status:string;runId:string|null;evidence:WorkEvidence|null;reason:string|null}
export interface AgentWorkflow {coordinatorId:string;id:string;groupId:string;groupRevision:number;messageId:string;title:string;prompt:string;revision:number;status:'active'|'paused'|'synthesizing'|'blocked'|'awaiting_review'|'completed'|'cancelled'|'expired';reason:string|null;runtimeId:string;runtime:WorkRuntime;members:GroupMember[];mentions:string[];sharedContext:SharedGroupContext;expiresAt:string;createdAt:string;updatedAt:string;steps:WorkflowStep[];finalCriteria:string;finalRunId:string|null;finalAnswer:string|null;finalEvidence:WorkEvidence|null;progress:{delivered:number;total:number}}
export interface CoordinationApi {
 groups():Promise<AgentGroup[]>;group(id:string):Promise<AgentGroup>;save(id:string,body:GroupBody):Promise<AgentGroup>;remove(group:AgentGroup):Promise<AgentGroup>;
 messages(groupId:string,key?:string):Promise<GroupMessage[]>;message(groupId:string,body:GroupMessageBody):Promise<{message:GroupMessage;run:Run}>;
 workflows(groupId:string,cursor?:string):Promise<{workflows:AgentWorkflow[];nextCursor:string|null}>;
 workflow(id:string):Promise<AgentWorkflow>;control(item:AgentWorkflow,action:WorkControl):Promise<AgentWorkflow>;confirm(item:AgentWorkflow):Promise<AgentWorkflow>;
}
export function groupProblem(body:GroupBody):string|null {
 if(!body.name.trim())return 'Name this group.';
 if(body.members.length<2||body.members.length>8)return 'Choose two to eight teammates.';
 if(!body.members.some(m=>m.agentId===body.coordinatorId))return 'Choose a coordinator from this group.';
 if(new Set(body.members.map(m=>m.agentId)).size!==body.members.length)return 'Each teammate can join once.';
 if(body.members.some(m=>!/^[a-z][a-z0-9_-]{0,31}$/.test(m.handle))||new Set(body.members.map(m=>m.handle)).size!==body.members.length)return 'Use unique handles with lowercase letters, numbers, underscores or hyphens.';
 return null;
}
/** Resolve visible mentions only against the explicitly reviewed membership. */
export function groupMentions(prompt:string,group:AgentGroup):string[]{
 const handles=[...prompt.matchAll(/(?:^|\s)@([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m=>m[1].toLowerCase());
 const unknown=handles.find(h=>!group.members.some(m=>m.handle===h));if(unknown)throw new Error(`@${unknown} is not a member of this group.`);
 return [...new Set(handles.map(h=>group.members.find(m=>m.handle===h)!.agentId))];
}
