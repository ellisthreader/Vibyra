import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AutoConstellation } from '../src/ui/AutoConstellation';
import { ThemeContext, palettes } from '../src/theme';
import type { AutoSelectionProgress } from '../src/ui/autoSelectionState';

const candidates = [
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', efforts: [] },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', efforts: [] },
  { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', efforts: [] },
  { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', efforts: [] },
];
/** Native animation sample only: no account, provider call or terminal launch. */
function NativeAutoConstellationFixture() {
  const [progress, setProgress] = useState<AutoSelectionProgress>({ phase: 'selecting', candidates });
  const [dark, setDark] = useState(true);
  const colors = dark ? palettes.dark : palettes.light;
  return <SafeAreaProvider><ThemeContext.Provider value={{ dark, colors }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted }}>Animation preview · Sample data</Text>
          <Pressable accessibilityRole="button" onPress={() => setDark(!dark)}><Text style={{ color: colors.accent }}>Theme</Text></Pressable>
        </View>
        <AutoConstellation progress={progress} failed={false} />
        <TextInput accessibilityLabel="Preview message" placeholder="Test the keyboard…" placeholderTextColor={colors.muted}
          style={{ color: colors.text, backgroundColor: colors.surface, padding: 20, margin: 16, borderRadius: 22 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle selection"
          onPress={() => setProgress(progress.phase === 'selecting'
            ? { phase: 'starting', selection: { model: candidates[1].id, name: candidates[1].name, effort: 'high' } }
            : { phase: 'selecting', candidates })} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: colors.accent }}>Toggle selection</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ThemeContext.Provider></SafeAreaProvider>;
}
registerRootComponent(NativeAutoConstellationFixture);
