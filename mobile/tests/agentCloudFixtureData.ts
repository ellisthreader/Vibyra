import { CloudRuntimeStore } from '../src/agents/v2/cloudRuntimeStore';
import type { CloudAgentPage } from '../src/agents/v2/cloudRuntimeModel';
export function cloudFixture(lost = false) {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  let page: CloudAgentPage = { enabled: true, requiresSetup: false, policy: null, computer: { workspaceId: id, state: 'running', online: true },
    accounts: [{provider:'claude',accountId:'cloud-opaque-owner',label:'Ellis · Cloud Claude',authenticated:true,online:true,models:['claude-opus-4-6'],efforts:['high']}] };
  const copy = () => JSON.parse(JSON.stringify(page));
  const store = new CloudRuntimeStore({read:async()=>copy(), quote:async(deviceId,budgetUnits,deadlineSeconds)=>({id,profile:'standard',cpus:2,memoryMb:4096,unitsPerHour:10000,unitScale:10000,budgetUnits,deadlineSeconds,expiresAt:Math.floor(Date.now()/1000)+300,deviceId,trial:false,native:false}),
    save:async body=>{ page={...page,policy:{revision:1,runtimeId:id,workspaceId:id,provider:'claude',accountId:body.accountId,accountLabel:'Ellis · Cloud Claude',model:body.model,expiresAt:body.expiresAt,remainingStarts:body.maxStarts,remainingBudgetUnits:body.totalBudgetUnits,remainingSeconds:body.totalSeconds,enabled:true,quote:{budgetUnits:10000,deadlineSeconds:900,unitsPerHour:10000,profile:'standard'}}};if(lost){lost=false;throw new Error('Simulated response lost.');}return copy();},
    revoke:async()=>{page={...page,policy:{...page.policy!,enabled:false,revision:2}};return copy();}},id,'local');
  return store;
}
