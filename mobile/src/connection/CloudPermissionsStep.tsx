import { useState } from 'react';
import { ScrollView, Text, View, Pressable, Switch } from 'react-native';
import type { RemotePermission } from '../remote/securityTypes';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import { font, GUTTER } from '../ui/font';
import { TextLink } from '../onboarding/OnboardingScaffold';

export function CloudPermissionsStep({ name, onConnect, onBack }: {
  name: string; onConnect(permissions: RemotePermission[]): void; onBack(): void;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'preview' | 'terminals'>('preview');
  const [control, setControl] = useState(false);
  const [files, setFiles] = useState(false);
  const switchStyle = { trackColor: { true: colors.action, false: colors.border }, thumbColor: colors.onAction,
    ...({ activeThumbColor: colors.onAction } as object) };
  const row = { paddingVertical: 16, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 };
  const permissions: RemotePermission[] = mode === 'preview' ? ['preview:access', 'screen:view'] : ['terminal:access'];
  if (mode === 'preview' && control) permissions.push('mouse:control', 'keyboard:control');
  if (files) permissions.push('files:read');
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: GUTTER, gap: 20 }}>
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[font.title, { color: colors.text }]}>Connect to {name}</Text>
      <Text style={[font.subhead, { color: colors.muted }]}>Choose what this connection can access. Your computer approves new devices.</Text>
    </View>
    <View>
      {([['preview', 'Preview', 'View the screens and previews your computer shares.'],
        ['terminals', 'Terminals', 'Read and control terminals, run commands and start work.']] as const).map(([value, title, detail]) =>
        <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }}
          onPress={() => setMode(value)} style={[row, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, gap: 4 }}><Text style={[font.headline, { color: colors.text }]}>{title}</Text>
            <Text style={[font.footnote, { color: colors.muted }]}>{detail}</Text></View>
          <Text style={{ color: colors.accent, fontSize: 22 }}>{mode === value ? '●' : '○'}</Text>
        </Pressable>)}
      {mode === 'preview' && <View style={row}><Text style={[font.row, { flex: 1, color: colors.text }]}>Control keyboard and mouse</Text>
        <Switch accessibilityLabel="Control keyboard and mouse" value={control} onValueChange={setControl} {...switchStyle} /></View>}
      <View style={row}><Text style={[font.row, { flex: 1, color: colors.text }]}>Read project files</Text>
        <Switch accessibilityLabel="Read project files" value={files} onValueChange={setFiles} {...switchStyle} /></View>
    </View>
    <View style={{ marginTop: 'auto', gap: 8 }}>
      <Button title="Connect securely" onPress={() => onConnect(permissions)} />
      <TextLink title="Back" onPress={onBack} />
    </View>
  </ScrollView>;
}
