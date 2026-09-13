import React from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { WorkScreen } from '../src/ui/WorkScreen';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

// The computer home on a runtime WITHOUT the phone AI chat - the browser, Android
// and the sample workspace all land here with `cloud` false. That is exactly the
// case that used to hand the picker an empty catalogue and show Auto alone, so
// this fixture pins it. `sampleVibesApi.models` returns nothing on purpose: the
// shipped fallback catalogue is what must carry the picker offline.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const cloud = query.get('cloud') === '1';

function Fixture() {
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <VibesProvider api={sampleVibesApi} identity={null} purchases={null}>
        <WorkScreen workspace={{ ...fixtureWorkspace, demo: true }} connected={false} cloud={cloud}
          onConnect={() => {}} onProjects={() => {}} onAi={() => {}}
          onWallet={() => { (window as unknown as { walletOpened?: boolean }).walletOpened = true; }} />
      </VibesProvider>
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
