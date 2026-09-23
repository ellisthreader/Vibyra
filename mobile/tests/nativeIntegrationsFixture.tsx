import { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { IntegrationsProvider } from '../src/integrations/IntegrationsProvider';
import { IntegrationsScreen } from '../src/ui/IntegrationsScreen';
import { createIntegrationsApi } from '../src/integrations/api';
import { readSecure, writeSecure } from '../src/transport/secureStorage';

// Isolated fixture: no user credentials and no real provider access.
const api = createIntegrationsApi('http://127.0.0.1:8106', () => readSecure('integration-native-fixture'));
function Fixture() {
  const [used, setUsed] = useState('');
  const [storage, setStorage] = useState('Checking secure guest storage…');
  useEffect(() => {
    void writeSecure('integration-native-fixture', 'fixture-guest').then(() => readSecure('integration-native-fixture'))
      .then(value => setStorage(value === 'fixture-guest' ? 'Secure guest storage verified' : 'Storage failed'))
      .catch(error => setStorage(error.message));
  }, []);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.background }}>
    <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
      <Text style={{ color: palettes.dark.text, fontSize: 24, marginHorizontal: 20 }}>Integrations</Text>
      <Text style={{ color: palettes.dark.muted, margin: 20 }}>Native test · Guest · {storage}</Text>
      {storage === 'Secure guest storage verified' && <IntegrationsProvider api={api} identity={null}>
        <IntegrationsScreen signedIn={false} onUse={setUsed} />
      </IntegrationsProvider>}
      {used ? <Text style={{ color: palettes.dark.text, margin: 20 }}>Chat mention: {used}</Text> : null}
    </ThemeContext.Provider>
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(Fixture);
