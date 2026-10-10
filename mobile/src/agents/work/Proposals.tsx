import {View} from 'react-native';
import {Button,Hint} from '../../ui/primitives';
import {useWorkProposals} from '../v2/useWorkProposals';
import type {StageFourApi} from '../v2/stageFourClient';
import {ProposalCard} from './ProposalCard';
export function Proposals({api,agentId,runId,active,disabled,onChanged}:{api:StageFourApi;agentId:string;runId?:string;active:boolean;disabled:boolean;onChanged?(kind?:string):void}) {
 const list=useWorkProposals(api.proposals,agentId,runId,active);
 return <View style={{gap:12}}>{list.error&&<Hint error>{list.error}</Hint>}{list.items.map(item=><ProposalCard key={item.id} item={item} api={api} disabled={disabled} onChanged={onChanged}/>)}{!runId&&!list.items.length&&<Hint>Chat suggestions appear here for review. A suggestion alone never starts work.</Hint>}{(!runId||list.error)&&<Button secondary title="Refresh proposals" busy={list.busy} onPress={()=>void list.refresh()}/>}</View>;
}
