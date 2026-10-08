import { useAgentRuntime } from './useAgentRuntime';
import { StructuredMemory } from './StructuredMemory';
export function RuntimeMemory(props:{agentId:string;identity:string;disabled:boolean}) {
  const {store,state}=useAgentRuntime(props.identity,props.agentId,true);
  if (!state.restored || (state.target==='cloud' && (state.loading || !state.page?.policy?.runtimeId)))
    return <div><p>{state.error || 'Refresh the selected Cloud account to review its memory.'}</p><button disabled={state.loading} onClick={()=>void store.refresh()}>Refresh memory account</button></div>;
  const runtimeId=state.target==='cloud'?state.page?.policy?.runtimeId:undefined;
  return <><p>{runtimeId?'Cloud account memory':'My computer account memory'}</p><StructuredMemory key={runtimeId??'local'} {...props} runtimeId={runtimeId}/></>;
}
