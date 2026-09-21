import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GenerationFixture } from './generationFixture';
import type { GenerationStage } from './generationFixtureData';
const query = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<SafeAreaProvider><GenerationFixture initialDark={query.get('theme') !== 'light'} initialStage={(query.get('state') ?? 'working') as GenerationStage} /></SafeAreaProvider>);
