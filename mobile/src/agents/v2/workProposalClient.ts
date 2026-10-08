import type { StageTwoCall } from './stageTwoModel';
import type { ProposalApi,WorkProposal } from './workProposalModel';
const enc=encodeURIComponent;
export function workProposalClient(call:StageTwoCall):ProposalApi {
 const item=async(path:string,body?:unknown,method?:'PATCH')=>(await call<{proposal:WorkProposal}>(path,body,method)).proposal;
 return {list:async(agent,run)=>(await call<{proposals:WorkProposal[]}>(`agents/v2/proposals?agentId=${enc(agent)}${run?`&runId=${enc(run)}`:''}`)).proposals,
 get:id=>item(`agents/v2/proposals/${enc(id)}`),edit:(p,spec)=>item(`agents/v2/proposals/${enc(p.id)}`,{revision:p.revision,spec},'PATCH'),
 accept:p=>item(`agents/v2/proposals/${enc(p.id)}/accept`,{revision:p.revision,reviewHash:p.reviewHash}),discard:p=>item(`agents/v2/proposals/${enc(p.id)}/discard`,{revision:p.revision})};
}
