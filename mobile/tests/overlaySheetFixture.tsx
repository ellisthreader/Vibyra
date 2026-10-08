import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { isAccentId, paletteFor, ThemeContext, useTheme } from '../src/theme';
import { OverlaySheet, useSheetBottomInset } from '../src/ui/OverlaySheet';

// The shared sheet on its own, over a stand-in app, so its geometry, ways out and
// motion can be proven without the drawer or the Settings pages. `?page=1` shows it
// as a page inside the sheet (Back present, header "Memory", dialog still "Settings").
// `?top=` and `?bottom=` set the safe-area insets; the defaults are a Dynamic Island iPhone.
const calls: string[] = [];
(window as unknown as { sheetCalls: string[] }).sheetCalls = calls;
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const accent = query.get('accent');
const page = query.get('page') === '1';
const insets = { top: Number(query.get('top') ?? 47), bottom: Number(query.get('bottom') ?? 34), left: 0, right: 0 };

function Page() {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  return <ScrollView testID="sheet-scroll" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom + 24, gap: 10 }}>
    {Array.from({ length: 14 }, (_, index) => <View key={index} style={{ minHeight: 52, borderRadius: 16, justifyContent: 'center',
      paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 16 }}>Row {index + 1}</Text></View>)}
    <TextInput accessibilityLabel="Fixture note" placeholder="A text box, for the keyboard" placeholderTextColor={colors.muted}
      style={{ minHeight: 52, borderRadius: 16, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.surface }} />
    <Text testID="sheet-bottom-inset" style={{ color: colors.muted }}>{`Bottom inset ${bottom}`}</Text>
  </ScrollView>;
}
function Fixture() {
  const colors = paletteFor(dark, isAccentId(accent) ? accent : 'cobalt');
  const [visible, setVisible] = useState(query.get('open') === '1');
  return <ThemeContext.Provider value={{ colors, dark }}>
    {/* The browser has no notch, and the provider re-measures `env()` after its first
        render, so the phone's insets are supplied to the hooks directly. */}
    <SafeAreaProvider><SafeAreaInsetsContext.Provider value={insets}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <View aria-hidden={visible} accessibilityElementsHidden={visible} importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}
          style={{ padding: 20, gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>Fixture app</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Open sheet" onPress={() => { calls.push('open'); setVisible(true); }}
            style={{ minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action }}>
            <Text style={{ color: colors.onAction, fontWeight: '600' }}>Open sheet</Text>
          </Pressable>
        </View>
        <OverlaySheet visible={visible} title={page ? 'Memory' : 'Settings'} label="Settings" testID="settings-sheet"
          onClose={() => { calls.push('close'); setVisible(false); }} onClosed={() => calls.push('closed')}
          onBack={page ? () => calls.push('back') : undefined}>
          <Page />
        </OverlaySheet>
      </View>
    </SafeAreaInsetsContext.Provider></SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
