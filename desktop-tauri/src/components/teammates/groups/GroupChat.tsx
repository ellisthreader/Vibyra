import type {AgentGroup,AgentWorkflow} from '../../../../../mobile/src/agents/v2/coordinationModel';
import type {StageFiveApi} from '../../../../../mobile/src/agents/v2/stageFiveClient';
import type {StageFourApi} from '../../../../../mobile/src/agents/v2/stageFourClient';
import type {StageTwoApi} from '../../../../../mobile/src/agents/v2/stageTwoModel';
import {useGroupChat} from '../../../../../mobile/src/agents/v2/useGroupChat';
import {PlanningMessage} from './PlanningMessage';
import {GroupComposer} from './GroupComposer';
import {WorkflowCard} from './WorkflowCard';
export function GroupChat({api,work,outputs,group,identity,active,disabled,workflows,onChanged,onOpenRun}:{api:StageFiveApi;work:StageFourApi;outputs:StageTwoApi;group:AgentGroup;identity:string;active:boolean;disabled:boolean;workflows:AgentWorkflow[];onChanged():void;onOpenRun(agentId:string,id:string):void}){
 const key=`agent-group.${encodeURIComponent(identity)}.${group.id}`,{store,state}=useGroupChat(api.coordination,group.id,{read:async()=>localStorage.getItem(key),write:async value=>{localStorage.setItem(key,value);}},()=>crypto.randomUUID(),active);
 return <div className="agent-work-core"><p className="profile-help">Coordinator: {group.members.find(m=>m.agentId===group.coordinatorId)?.name} · {group.members.map(m=>`@${m.handle}`).join(', ')}</p>{state.messages.slice().reverse().map(m=><PlanningMessage key={m.id} api={api} work={work} message={m} active={active} disabled={disabled} onChanged={onChanged} onOpenRun={onOpenRun}/>)}{workflows.map(w=><WorkflowCard key={w.id} api={api.coordination} workflow={w} coordinatorId={w.coordinatorId} disabled={disabled} onOpenRun={onOpenRun}/ >)}<GroupComposer api={api} outputs={outputs} group={group} store={store} state={state} disabled={disabled||Boolean(group.deletedAt)}/></div>;
}
