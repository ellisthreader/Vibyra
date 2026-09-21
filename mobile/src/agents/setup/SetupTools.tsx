import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIntegrations } from '../../integrations/IntegrationsProvider';
import { integrationBrand } from '../../integrations/integrationBrands';
import { Mark } from '../../ui/BrandLogo';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import { form, SetupField, SetupHeading, SetupSection } from './SetupForm';

export function SetupTools({ selected, disabled, onChange, plans, onPlans }: {
  selected: string[]; disabled: boolean; onChange(ids: string[]): void; plans: string; onPlans(text: string): void;
}) {
  const { colors } = useTheme(); const apps = useIntegrations(); const [more, setMore] = useState(Boolean(plans));
  const available = apps.catalogue.integrations.filter(app => ['github', 'stripe', 'figma'].includes(app.id) && app.credential.kind !== 'device');
  const usable = apps.live && apps.catalogue.enabled;
  const descriptions: Record<string, string> = { github: 'Repositories, pull requests and issues', stripe: 'Payments, customers and billing', figma: 'Design files and project context' };
  return <View style={form.body}>
    <SetupHeading title="Tools" description="Choose the services this teammate can work with." />
    <SetupSection label="AVAILABLE SERVICES"><View>{available.map(app => {
      const canConnect = usable && app.credential.kind === 'oauth' && app.credential.configured;
      const checked = selected.includes(app.id);
      return <View key={app.id} style={[s.service, { borderColor: colors.border }]}>
        <View style={s.row}><Mark brand={integrationBrand(app.id)} size={32} /><View style={s.grow}>
          <Text style={[s.label, { color: colors.text }]}>{app.name}</Text>
          <Text style={[s.status, { color: colors.muted }]}>{app.installed ? checked ? 'Access allowed' : 'Connected · access off' : 'Not connected'}</Text></View>
          {app.installed ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`Allow ${app.name}`} disabled={disabled || !usable}
            aria-checked={checked} accessibilityState={{ checked, disabled: disabled || !usable }}
            onPress={() => onChange(checked ? selected.filter(id => id !== app.id) : [...selected, app.id].slice(0, 3))} style={s.select}>
            <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={checked ? colors.accent : colors.muted} />
          </Pressable> : canConnect ? <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${app.name}`} disabled={disabled || apps.busy !== null}
            onPress={() => { void apps.authorize(app.id).catch(() => {}); }} style={[s.connect, { backgroundColor: colors.elevated }]}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>Connect</Text></Pressable>
            : <Text style={[s.status, { color: colors.muted }]}>Unavailable</Text>}
        </View><Text style={[s.detail, { color: colors.muted }]}>{descriptions[app.id]}</Text>
      </View>;
    })}</View></SetupSection>
    <View style={s.note}><Icon name="shield-checkmark-outline" size={17} color={colors.muted} />
      <Text style={[s.detail, s.grow, { color: colors.muted }]}>Connecting an account doesn’t grant access. Actions that change a service still need your approval.</Text></View>
    {selected.filter(id => !available.some(app => app.id === id && app.installed)).map(id => <Button key={id} secondary title={`Remove unavailable ${id} access`}
      disabled={disabled} onPress={() => onChange(selected.filter(value => value !== id))} />)}
    {apps.error && <><Hint error>{apps.error}</Hint><Button secondary title="Refresh tools" disabled={apps.busy !== null} onPress={() => { void apps.refresh(); }} /></>}
    {!usable && <Hint>Connections are unavailable here. You can still share context in chat.</Hint>}
    <Pressable accessibilityRole="button" accessibilityLabel="Other tool plans" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={s.other}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Other tool plans</Text><Icon name={more ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} /></Pressable>
    {more && <SetupField label="Tools for later" accessibilityLabel="Planned tools" value={plans} onChangeText={onPlans} editable={!disabled} multiline maxLength={4000}
      placeholder="e.g. Slack, calendar…" hint="Saved as a plan on this phone. These tools won’t be connected." />}
  </View>;
}
const s = StyleSheet.create({ service: { paddingVertical: 18, gap: 9, borderBottomWidth: StyleSheet.hairlineWidth }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 }, label: { fontSize: 16, fontWeight: '500' }, status: { fontSize: 12, marginTop: 4 }, detail: { fontSize: 13, lineHeight: 19 },
  select: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, connect: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 10 }, other: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
