import type {WorkflowSpec,GroupMember} from './coordinationModel';
export interface CoordinationReview {groupId:string;groupName:string;groupRevision:number;messageId:string;members:GroupMember[];mentions:string[];sharedContext:{text:string;outputs:{id:string;revision:number;title:string;kind:string}[]}}
export function workflowReview(spec:WorkflowSpec,context?:CoordinationReview):{label:string;text:string}[]{
 const rows:{label:string;text:string}[]=[],add=(label:string,text:unknown)=>rows.push({label,text:String(text??'')});
 add('Group',context?.groupName??spec.groupId);add('Group version',spec.groupRevision);
 context?.members.forEach(m=>add(`@${m.handle}`,`${m.name} · profile version ${m.profileRevision}`));
 add('Original request',spec.prompt);add('Shared text',spec.sharedContext.text||'No extra text');
 spec.sharedContext.outputs.forEach(o=>{const named=context?.sharedContext.outputs.find(x=>x.id===o.id&&x.revision===o.revision);add('Shared output',`${named?.title??o.id} · version ${o.revision}`);});
 add('Context boundary','Only the request, explicitly shared context and declared dependency results. Private chat history and memory stay private.');
 add('Title',spec.title);add('Work expires',spec.expiresAt);
 spec.steps.forEach((s,i)=>{const member=context?.members.find(m=>m.agentId===s.agentId);add(`Task ${i+1}`,s.title);add('Assigned teammate',member?`${member.name} · @${member.handle}`:s.agentId);add('Task',s.prompt);add('Finished means',s.successCriteria);add('After',s.dependsOn.map(k=>spec.steps.find(x=>x.key===k)?.title??k).join(', ')||'No dependencies');});
 add('Coordinator final result must satisfy',spec.finalCriteria);return rows;
}
