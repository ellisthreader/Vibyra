import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { Mark } from '../../ui/BrandLogo';
import { Button, Icon } from '../../ui/primitives';
import { font } from '../../ui/font';
import type { CatalogueProvider } from '../../agents/v2/connectionsModel';
import { catalogueLine, unavailableReason } from '../../agents/v2/hubModel';
import { integrationBrand } from '../integrationBrands';

/**
 * Every provider a teammate could use, with honest readiness. A provider that cannot be
 * connected here says why in plain words and is not a button at all.
 */
export function CatalogueList({ providers, busy, onConnect, onPaste }: {
  providers: CatalogueProvider[]; busy: string | null; onConnect(provider: string): void; onPaste(provider: string, token: string): void;
}) {
  const { colors } = useTheme();
  const [pasting, setPasting] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const shown = providers.filter(p => p.kind !== 'mcp');
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {shown.map((p, index) => {
        const reason = unavailableReason(p);
        const working = busy === `add:${p.provider}`;
        return (
          <View key={p.provider} style={index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <Pressable accessibilityRole="button" accessibilityLabel={reason ? `${p.name}, not available: ${reason}` : `Connect ${p.name}`}
              accessibilityState={{ disabled: Boolean(reason) || busy !== null, busy: working }} disabled={Boolean(reason) || busy !== null}
              onPress={() => onConnect(p.provider)} style={({ pressed }) => [s.row, { opacity: reason ? 0.62 : pressed ? 0.55 : 1 }]}>
              <Mark brand={integrationBrand(p.provider)} size={34} />
              <View style={s.text}>
                <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{p.name}</Text>
                <Text style={[s.detail, { color: colors.muted }]}>
                  {reason ?? (working ? 'Finish signing in…' : catalogueLine(p))}
                </Text>
              </View>
              {!reason && <Icon name="add-circle-outline" size={20} color={colors.accent} />}
            </Pressable>
            {!reason && p.connect.includes('token') && (pasting === p.provider ? (
              <View style={s.paste}>
                <TextInput accessibilityLabel={`${p.name} access token`} value={token} onChangeText={setToken} secureTextEntry
                  autoCapitalize="none" autoCorrect={false} placeholder="Paste an access token" placeholderTextColor={colors.muted}
                  style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.workspace }]} />
                <View style={s.actions}>
                  <View style={s.grow}><Button secondary title="Cancel" onPress={() => { setPasting(null); setToken(''); }} /></View>
                  <View style={s.grow}><Button title="Add account" label={`Add ${p.name} token`} disabled={!token.trim() || busy !== null}
                    busy={busy === `paste:${p.provider}`} onPress={() => { onPaste(p.provider, token.trim()); setToken(''); setPasting(null); }} /></View>
                </View>
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={`Add ${p.name} with a token`} onPress={() => setPasting(p.provider)} style={s.link}>
                <Text style={[s.linkText, { color: colors.accent }]}>Use an access token instead</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 62 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  detail: { ...font.footnote },
  paste: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  link: { paddingLeft: 64, paddingBottom: 12, minHeight: 32, justifyContent: 'center' },
  linkText: { ...font.footnote, fontWeight: '500' },
});
