import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, StatusBar, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import { palettes, ThemeContext } from '../src/theme';
import { NavigationDrawer } from '../src/ui/NavigationDrawer';
import type { Destination } from '../src/ui/types';

function NativeDrawerFixture() {
  const dark = useColorScheme() !== 'light';
  const colors = dark ? palettes.dark : palettes.light;
  const [visible, setVisible] = useState(true);
  const [destination, setDestination] = useState<Destination>('work');
  const workspace = useDemoWorkspace({ themePreference: dark ? 'dark' : 'light', setTheme: () => {}, exitDemo: () => {} });
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Pressable onPress={() => setVisible(true)} accessibilityRole="button" accessibilityLabel="Open navigation menu">
          <Text style={{ color: colors.text }}>Sidebar design fixture · {destination}</Text>
        </Pressable>
      </View>
      <NavigationDrawer visible={visible} destination={destination} workspace={workspace}
        onClose={() => setVisible(false)} onNavigate={setDestination} onNew={() => workspace.actions.selectSession(null)} />
    </SafeAreaView>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(NativeDrawerFixture);
