import {useWorkProposals} from '../../../../../mobile/src/agents/v2/useWorkProposals';
import type {StageFourApi} from '../../../../../mobile/src/agents/v2/stageFourClient';
import {ProposalCard} from './ProposalCard';
export function Proposals({api,agentId,runId,active,disabled,onChanged}:{api:StageFourApi;agentId:string;runId?:string;active:boolean;disabled:boolean;onChanged?(kind?:string):void}) {
 const list=useWorkProposals(api.proposals,agentId,runId,active);
 return <section>{list.error&&<p role="alert">{list.error}</p>}{list.items.map(item=><ProposalCard key={item.id} item={item} api={api} disabled={disabled} onChanged={onChanged}/>)}{!runId&&!list.items.length&&<p className="profile-help">Chat suggestions appear here for review. A suggestion alone never starts work.</p>}{(!runId||list.error)&&<button type="button" disabled={list.busy} onClick={()=>void list.refresh()}>Refresh proposals</button>}</section>;
}
