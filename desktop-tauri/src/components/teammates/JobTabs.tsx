import type {useThread} from './useThread';
import {jobCapacity,queueReason} from '../../../../mobile/src/agents/v2/jobsModel';
export function JobTabs({chat,selected,onSelect,disabled}:{chat:ReturnType<typeof useThread>;selected:string|null;onSelect(id:string|null):void;disabled:boolean}){
 if(!chat.parallelJobs)return null;
 const current=chat.jobs.page?.runs.find(r=>r.id===selected);
 return <div className="agent-job-tabs"><small>{chat.jobs.page&&jobCapacity(chat.jobs.page.capacity)}</small><div role="group" aria-label="Choose job"><button type="button" aria-pressed={!selected} onClick={()=>onSelect(null)}>All jobs</button>{chat.turns.filter(t=>t.v2).map((t,i)=><button type="button" key={t.id} aria-pressed={selected===t.id} onClick={()=>onSelect(t.id)}>Job {i+1} · {t.status}</button>)}</div>{current&&<p>{current.prompt}{current.job?.queueReason&&<> · {queueReason(current.job.queueReason)}</>}{!current.terminal&&<button type="button" disabled={disabled||chat.busy} onClick={()=>void chat.stop(current.id)}>Cancel this job</button>}</p>}</div>;
}
