import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NewSessionFixtureScreen } from './newSessionFixtureScreen';

function NativeNewSessionFixture() {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#181A20' }}>
    <View style={{ padding: 24, gap: 24 }}>
      {(['dark', 'light'] as const).map(value => <Pressable key={value} accessibilityRole="button"
        accessibilityLabel={`Open ${value} terminal sheet`} onPress={() => setTheme(value)} style={{ minHeight: 48 }}>
        <Text style={{ color: '#FFFFFF' }}>{`Open ${value} terminal sheet`}</Text>
      </Pressable>)}
    </View>
    {theme && <NewSessionFixtureScreen dark={theme === 'dark'} onClose={() => setTheme(null)} />}
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(NativeNewSessionFixture);
