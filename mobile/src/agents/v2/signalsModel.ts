export type SignalMode='decisions'|'daily'|'all';
export interface SignalPreferences {revision:number;mode:SignalMode;timezone:string;quietStart:number|null;quietEnd:number|null;digestMinute:number}
export type SignalInterest='code'|'email'|'meetings';
export interface StarterSuggestion {key:string;templateKey:string;title:string;reason:string;ready:boolean;missing:string[];firstTask:null|{prompt:string;readOnly:true}}
export interface SignalOnboarding {revision:number;interests:SignalInterest[];dismissed:boolean;suggestions:StarterSuggestion[]}
export interface SignalConnection {id:string;provider:'github';account:string;readGranted:boolean}
export interface GoalContext {id:string;title:string;status:string;milestone:null|{key:string;title:string;successCriteria:string;status:string};reason:string;reviewRequired:true}
export interface ProjectWatch {goalId?:string|null;goalContext?:GoalContext|null;id:string;agentId:string;connectionId:string;repository:string;enabled:boolean;revision:number;status:'watching'|'paused'|'needs_review';lastCheckedAt:string|null;nextCheckAt:string|null;error:string|null;coverage:string}
export interface ProjectFinding {goalContext?:GoalContext|null;id:string;watchId:string;agentId:string;kind:'status_changed'|'merge_conflict'|'conflict_resolved';title:string;source:{provider:'github';repository:string;number:number;url:string};evidence:{before:unknown;after:unknown};confidence:'verified';observedAt:string;sourceUpdatedAt:string;expiresAt:string;fresh:boolean}
export interface WorkDigest {id:string;notificationId:string|null;date:string;timezone:string;createdAt:string;read:boolean;items:{notificationId:string;agentId:string;runId:string;conversationId:string;kind:string;title:string;createdAt:string}[]}
export interface SignalsPage {goals?:{id:string;title:string;status:string}[];enabled:boolean;preferences:SignalPreferences;onboarding:SignalOnboarding;watches:ProjectWatch[];findings:ProjectFinding[];digests:WorkDigest[];connections:SignalConnection[]}
export interface SignalsApi {read(agentId:string):Promise<SignalsPage>;preferences(p:SignalPreferences):Promise<SignalPreferences>;onboarding(agentId:string,p:SignalOnboarding):Promise<SignalOnboarding>;watch(p:Pick<ProjectWatch,'id'|'revision'|'agentId'|'connectionId'|'repository'|'enabled'|'goalId'>):Promise<ProjectWatch>;dismiss(id:string):Promise<void>;acknowledge(id:string):Promise<void>;digest(id:string):Promise<WorkDigest>}
export const clockText=(minute:number|null)=>minute===null?'':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function clockMinute(value:string):number|null {if(value==='')return null;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('Enter a time as HH:MM.');const [h,m]=value.split(':').map(Number);return h*60+m;}
export function findingLink(item:ProjectFinding):string|null {try{const u=new URL(item.source.url);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&u.pathname===`/${item.source.repository}/pull/${item.source.number}`?u.href:null;}catch{return null;}}

export function findingEvidence(value:unknown):string {
 if(value===null||value===undefined)return 'Not reported';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='string'||typeof value==='number')return String(value);
 if(Array.isArray(value))return value.map(findingEvidence).join(', ');
 return Object.entries(value as Record<string,unknown>).map(([key,v])=>`${key.replaceAll('_',' ')}: ${findingEvidence(v)}`).join(' · ');
}

export function checkedDigest(value:WorkDigest,id:string):WorkDigest {
 const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
 if(value.id!==id||!Array.isArray(value.items)||value.items.some(x=>!uuid(x.agentId)||!uuid(x.runId)||!uuid(x.notificationId))||(value.notificationId!==null&&!uuid(value.notificationId)))throw new Error('This daily summary returned invalid task links.');
 return value;
}

export function goalContextText(value:GoalContext):string {return `${value.title} · ${value.status}${value.milestone?`\nMilestone: ${value.milestone.title} · ${value.milestone.status}\nFinished means: ${value.milestone.successCriteria}`:''}\n${value.reason}`;}
