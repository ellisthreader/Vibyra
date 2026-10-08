import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkPanel} from '../src/components/teammates/work/WorkPanel';
import {agentId,workFixture} from '../../mobile/tests/agentWorkFixtureData';
function Fixture(){const [events,setEvents]=useState<string[]>([]),[api]=useState(()=>workFixture(true,e=>setEvents(v=>[...v,e])));return <main style={{overflow:'auto',height:'100vh',padding:24,color:'var(--text)',background:'var(--bg)',width:'100%'}}><h2>Work · Launch assistant</h2><WorkPanel api={api} agentId={agentId} active disabled={false} routines={<p>No saved routines.</p>} onOpenRun={id=>setEvents(v=>[...v,'open-run:'+id])} onDraft={()=>setEvents(v=>[...v,'prepare-draft'])} onDigest={id=>setEvents(v=>[...v,'open-digest:'+id])}/><output data-testid="events">{events.join('|')}</output></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
