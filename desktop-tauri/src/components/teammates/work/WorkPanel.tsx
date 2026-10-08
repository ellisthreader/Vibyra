import {Fragment,useState,type ReactNode} from 'react';
import type {StageFourApi} from '../../../../../mobile/src/agents/v2/stageFourClient';
import {CoreWork} from './CoreWork';
import {SignalsWork} from './SignalsWork';
import {Proposals} from './Proposals';
import '../../../styles/agent-work.css';
export function WorkPanel({api,agentId,active,disabled,routines,onOpenRun,onDraft,onDigest}:{api:StageFourApi;agentId:string;active:boolean;disabled:boolean;routines:ReactNode;onOpenRun?(id:string):void;onDraft?(prompt:string):void;onDigest?(id:string):void}) {
 const [refreshVersion,setRefreshVersion]=useState(0),[routineVersion,setRoutineVersion]=useState(0);
 return <div className="agent-work-core"><Proposals api={api} agentId={agentId} active={active} disabled={disabled} onChanged={kind=>{setRefreshVersion(v=>v+1);if(kind==='routine')setRoutineVersion(v=>v+1);}}/><CoreWork refreshVersion={refreshVersion} api={api.core} agentId={agentId} active={active} disabled={disabled} onOpenRun={onOpenRun}/><h3>Routines</h3><Fragment key={routineVersion}>{routines}</Fragment><SignalsWork api={api.signals} agentId={agentId} active={active} disabled={disabled} onDraft={onDraft} onDigest={onDigest}/></div>;
}
