import type {Run} from './runCore';
export interface JobMetadata {mode:'independent'|'ordered'|'coordinated';queueReason:null|'capacity'|'earlier_turn'|'resource_busy'|'runtime_upgrade'|'membership_required'|'job_mode_disabled';slot:null|0|1|2}
export interface JobCapacity {running:number;maxRunning:number;queued:number;maxQueued:number}
export interface JobsPage {enabled:boolean;runs:Run[];capacity:JobCapacity}
export interface JobsApi {list(agentId?:string):Promise<JobsPage>;cancel(id:string):Promise<Run>}
export function checkedJobs(page:JobsPage,agentId?:string):JobsPage {
 if(!page||typeof page.enabled!=='boolean'||!Array.isArray(page.runs)||page.runs.some(r=>!r.id||(agentId&&r.agentId!==agentId))||!page.capacity||(['running','maxRunning','queued','maxQueued'] as const).some(k=>!Number.isInteger(page.capacity[k])||page.capacity[k]<0))throw new Error('Jobs returned an invalid account or teammate. Refresh before continuing.');
 return page;
}
export const queueReason=(value:JobMetadata['queueReason'])=>value?({capacity:'Waiting for a free job slot',earlier_turn:'Waiting for the earlier task',resource_busy:'Waiting for the same file or resource',runtime_upgrade:'Update this runtime to run independent jobs',membership_required:'Renew Pro to resume this job',job_mode_disabled:'Independent jobs are temporarily unavailable'}[value]??''):'';
export const jobCapacity=(c:JobCapacity)=>`${c.running}/${c.maxRunning} running · ${c.queued}/${c.maxQueued} queued across your account`;
export function checkQueue(page:JobsPage){if(page.enabled&&page.capacity.queued>=page.capacity.maxQueued)throw new Error('Your job queue is full. Wait for a task to finish or cancel one. Your draft is saved.');}
