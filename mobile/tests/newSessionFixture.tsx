import { createRoot } from 'react-dom/client';
import { NewSessionFixtureScreen, newSessionEvents } from './newSessionFixtureScreen';

const query = new URLSearchParams(location.search);
for (const key of Object.keys(newSessionEvents) as (keyof typeof newSessionEvents)[]) {
  Object.defineProperty(window, key, { get: () => newSessionEvents[key] });
}
createRoot(document.getElementById('root')!).render(<NewSessionFixtureScreen dark={query.get('theme') !== 'light'}
  oldHost={query.get('phone') === 'old'} offline={query.has('offline')} longNames={query.has('long')} deferStart={query.has('slow')} />);
