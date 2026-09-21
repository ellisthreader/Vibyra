import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { FoundComputer } from '../src/connection/FoundComputer';

// Visual-only native replay: no discovery, connection, account, or saved data.
function Fixture() {
  const [round, setRound] = useState(0);
  const [dark, setDark] = useState(true);
  const [compact, setCompact] = useState(false);
  const colors = palettes[dark ? 'dark' : 'light'];
  return <ThemeContext.Provider value={{ colors, dark }}>
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 140, gap: 28 }}>
      <FoundComputer key={round} computer={{ id: 'fixture', name: 'Test MacBook', platform: 'macos' }} compact={compact} />
      {[
        ['Replay opening', () => setRound(value => value + 1)],
        ['Toggle theme', () => { setDark(value => !value); setRound(value => value + 1); }],
        ['Toggle compact', () => { setCompact(value => !value); setRound(value => value + 1); }],
      ].map(([label, action]) => <Pressable key={String(label)} accessibilityRole="button"
        onPress={action as () => void} style={{ padding: 16, alignSelf: 'center' }}>
        <Text style={{ color: colors.text }}>{String(label)}</Text>
      </Pressable>)}
    </View>
  </ThemeContext.Provider>;
}
registerRootComponent(Fixture);
