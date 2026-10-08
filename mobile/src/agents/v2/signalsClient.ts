import type {StageTwoCall} from './stageTwoModel';
import type {SignalsApi,SignalsPage,SignalPreferences,SignalOnboarding,ProjectWatch,WorkDigest} from './signalsModel';
const enc=encodeURIComponent;
export function signalsClient(call:StageTwoCall):SignalsApi {return {
 read:agent=>call<SignalsPage>(`agents/v2/signals?agentId=${enc(agent)}`),
 preferences:async p=>(await call<{preferences:SignalPreferences}>('agents/v2/signals/preferences',{expectedRevision:p.revision,mode:p.mode,timezone:p.timezone,quietStart:p.quietStart,quietEnd:p.quietEnd,digestMinute:p.digestMinute},'PUT')).preferences,
 onboarding:async(agentId,p)=>(await call<{onboarding:SignalOnboarding}>('agents/v2/signals/onboarding',{expectedRevision:p.revision,agentId,interests:p.interests,dismissed:p.dismissed},'PUT')).onboarding,
 watch:async p=>(await call<{watch:ProjectWatch}>(`agents/v2/signals/watches/${enc(p.id)}`,{expectedRevision:p.revision,agentId:p.agentId,connectionId:p.connectionId,repository:p.repository,enabled:p.enabled,...(p.goalId!==undefined?{goalId:p.goalId}:{})},'PUT')).watch,
 dismiss:async id=>{await call(`agents/v2/signals/findings/${enc(id)}/dismiss`,{});},
 acknowledge:async id=>{await call(`notifications/v1/inbox/${enc(id)}/read`,{});},
 digest:async id=>(await call<{digest:WorkDigest}>(`agents/v2/signals/digests/${enc(id)}`)).digest,
};}
