import React, { useRef } from 'react';
import { registerRootComponent } from 'expo';
import { Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DiscoveryStep } from '../src/connection/DiscoveryStep';
import { nearbyPairingLink } from '../src/connection/nearbyPairing';
import { ThemeContext, palettes } from '../src/theme';

/** Real native adapter, without pairing or writing to the running Desktop. */
function NativeDiscoveryFixture() {
  const reported = useRef(false);
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.background }}>
      <Text style={{ fontSize: 11, color: palettes.dark.muted, textAlign: 'center', paddingVertical: 10 }}>
        Native discovery fixture
      </Text>
      <DiscoveryStep onBack={() => {}} onSelect={computer => {
        if (reported.current) return;
        reported.current = true;
        void fetch('http://127.0.0.1:8097/result', { method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ computer, pairing: JSON.parse(nearbyPairingLink(computer)) }) });
      }} />
    </SafeAreaView>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(NativeDiscoveryFixture);
