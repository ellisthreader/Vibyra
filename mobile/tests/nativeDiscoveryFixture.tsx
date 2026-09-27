import { registerRootComponent, requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DiscoveryStep } from '../src/connection/DiscoveryStep';
import { localDiscovery } from '../src/connection/localDiscovery';
import { isConnectable, nearbyPairingLink } from '../src/connection/nearbyPairing';
import { ThemeContext, palettes } from '../src/theme';

// The screen now waits for a person to confirm the computer, and a simulator
// cannot tap. So the adapter's updates are read on their way to the real
// screen: still one search, because the native module runs only one at a time.
let reported = false;
const resultPort = Constants.expoConfig?.extra?.discoveryFixturePort ?? 8097;
const resultHost = process.env.EXPO_PUBLIC_DISCOVERY_RESULT_HOST ?? '127.0.0.1';
const adapterStart = localDiscovery.start.bind(localDiscovery);
localDiscovery.start = onUpdate => adapterStart(update => {
  const computer = update.computers.find(isConnectable);
  if (computer && !reported) {
    reported = true;
    void fetch(`http://${resultHost}:${resultPort}/result`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ computer, pairing: JSON.parse(nearbyPairingLink(computer)),
        nativeBonjour: Boolean(requireOptionalNativeModule('VibyraDiscovery')) }) });
  }
  onUpdate(update);
});

/** Real native adapter, without pairing or writing to the running Desktop. */
function NativeDiscoveryFixture() {
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.background }}>
      <Text style={{ fontSize: 11, color: palettes.dark.muted, textAlign: 'center', paddingVertical: 10 }}>
        Native discovery fixture
      </Text>
      <DiscoveryStep onBack={() => {}} onSelect={() => {}} />
    </SafeAreaView>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(NativeDiscoveryFixture);
