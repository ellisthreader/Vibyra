import {workCoreClient} from './workCoreClient';
import {workProposalClient} from './workProposalClient';
import {signalsClient} from './signalsClient';
import type {StageTwoCall} from './stageTwoModel';
export const stageFourClient=(call:StageTwoCall)=>({core:workCoreClient(call),proposals:workProposalClient(call),signals:signalsClient(call)});
export type StageFourApi=ReturnType<typeof stageFourClient>;
