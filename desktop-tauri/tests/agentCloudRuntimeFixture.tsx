import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { useRuntimeLifecycle } from '../src/components/teammates/useRuntimeLifecycle';
import { AgentRuntime } from '../src/components/teammates/AgentRuntime';
import { cloudFixture } from '../../mobile/tests/agentCloudFixtureData';
function Fixture() {
  const [store]=useState(()=>cloudFixture(new URLSearchParams(location.search).has('lost'))), state=useSyncExternalStore(store.subscribe,store.snapshot);
  const [active,setActive]=useState(true); useRuntimeLifecycle(store,active);
  const lifecycle=new URLSearchParams(location.search).has('lifecycle');
  return <main style={{overflow:'auto',fontFamily:'system-ui',padding:24,color:'var(--text)',background:'var(--bg)',width:'100%'}}><h2>Agent runtime</h2>{lifecycle&&<><button onClick={()=>setActive(!active)}>{active?'Leave thread':'Return to thread'}</button><output data-testid="runtime-choice">{state.target}</output></>}<AgentRuntime store={store} state={state} disabled={false} onSetup={()=>{}} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
