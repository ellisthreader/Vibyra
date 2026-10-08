import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Decision } from '../src/components/teammates/Decision';
import { runTurn } from '../src/components/teammates/runsV2';
import { currentRun } from './stageTwoDraftApi';
document.documentElement.dataset.theme = new URLSearchParams(location.search).has('light') ? 'light' : 'dark';
function App() {
  const [turn, setTurn] = useState(() => runTurn(currentRun()));
  return <main className="teammate-setup teammate-profile" style={{ maxWidth: 760, padding: 24, margin: 'auto' }}><Decision turn={turn} tool={turn.tools[0]} enabled refresh={async () => { setTurn(runTurn(currentRun())); }} /></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
