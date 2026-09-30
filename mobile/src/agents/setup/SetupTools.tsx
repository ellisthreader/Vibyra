import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIntegrations } from '../../integrations/IntegrationsProvider';
import { integrationBrand } from '../../integrations/integrationBrands';
import { Mark } from '../../ui/BrandLogo';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import { form, SetupCard, SetupField, SetupHeading, SetupSection } from './SetupForm';
import { font } from '../../ui/font';

export function SetupTools({
  selected,
  disabled,
  onChange,
  plans,
  onPlans,
}: {
  selected: string[];
  disabled: boolean;
  onChange(ids: string[]): void;
  plans: string;
  onPlans(text: string): void;
}) {
  const { colors } = useTheme();
  const apps = useIntegrations();
  const [more, setMore] = useState(Boolean(plans));
  useEffect(() => {
    if (plans) setMore(true);
  }, [plans]);
  const available = apps.catalogue.integrations.filter(
    (app) => ['github', 'stripe', 'figma'].includes(app.id) && app.credential.kind !== 'device',
  );
  const usable = apps.live && apps.catalogue.enabled;
  const descriptions: Record<string, string> = {
    github: 'Repositories, pull requests and issues',
    stripe: 'Payments, customers and billing',
    figma: 'Design files and project context',
  };
  return (
    <View style={form.body}>
      <SetupHeading title="Tools" description="Choose the services this teammate can work with." />
      <SetupSection label="Available services">
        <SetupCard>
          {available.map((app, index) => {
            const canConnect =
              usable && app.credential.kind === 'oauth' && app.credential.configured;
            const checked = selected.includes(app.id);
            return (
              <View
                key={app.id}
                style={[
                  s.service,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={s.row}>
                  <Mark brand={integrationBrand(app.id)} size={36} />
                  <View style={s.grow}>
                    <Text style={[s.label, { color: colors.text }]}>{app.name}</Text>
                    <Text style={[s.status, { color: checked ? colors.success : colors.muted }]}>
                      {app.installed
                        ? checked
                          ? 'Access allowed'
                          : 'Connected · access off'
                        : 'Not connected'}
                    </Text>
                  </View>
                  {app.installed ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={`Allow ${app.name}`}
                      disabled={disabled || !usable}
                      aria-checked={checked}
                      accessibilityState={{ checked, disabled: disabled || !usable }}
                      onPress={() =>
                        onChange(
                          checked
                            ? selected.filter((id) => id !== app.id)
                            : [...selected, app.id].slice(0, 3),
                        )
                      }
                      style={s.select}
                    >
                      <Icon
                        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={25}
                        color={checked ? colors.accent : colors.muted}
                      />
                    </Pressable>
                  ) : canConnect ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Connect ${app.name}`}
                      disabled={disabled || apps.busy !== null}
                      onPress={() => {
                        void apps.authorize(app.id).catch(() => {});
                      }}
                      hitSlop={5}
                      style={[s.connect, { backgroundColor: colors.elevated }]}
                    >
                      <Text style={[s.connectText, { color: colors.text }]}>Connect</Text>
                    </Pressable>
                  ) : (
                    <Text style={[s.unavailable, { color: colors.muted }]}>Unavailable</Text>
                  )}
                </View>
                {/* Under the name, at the text column's edge, so it has the card's full width. */}
                <Text style={[s.detail, { color: colors.muted }]}>{descriptions[app.id]}</Text>
              </View>
            );
          })}
        </SetupCard>
      </SetupSection>
      <View style={s.note}>
        <Icon name="shield-checkmark-outline" size={16} color={colors.muted} />
        <Text style={[s.noteText, s.grow, { color: colors.muted }]}>
          Connecting an account doesn’t grant access. Actions that change a service still need your
          approval.
        </Text>
      </View>
      {selected
        .filter((id) => !available.some((app) => app.id === id && app.installed))
        .map((id) => (
          <Button
            key={id}
            secondary
            title={`Remove unavailable ${id} access`}
            disabled={disabled}
            onPress={() => onChange(selected.filter((value) => value !== id))}
          />
        ))}
      {apps.error && (
        <>
          <Hint error>{apps.error}</Hint>
          <Button
            secondary
            title="Refresh tools"
            disabled={apps.busy !== null}
            onPress={() => {
              void apps.refresh();
            }}
          />
        </>
      )}
      {!usable && (
        <Hint>Connections are unavailable here. You can still share context in chat.</Hint>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Other tool plans"
        accessibilityState={{ expanded: more }}
        onPress={() => setMore(!more)}
        style={s.other}
      >
        <Text style={[s.otherText, { color: colors.text }]}>Other tool plans</Text>
        <Icon name={more ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
      </Pressable>
      {more && (
        <SetupField
          label="Tools for later"
          accessibilityLabel="Planned tools"
          value={plans}
          onChangeText={onPlans}
          editable={!disabled}
          multiline
          maxLength={4000}
          placeholder="e.g. Slack, calendar…"
          hint="Saved as a plan on this phone. These tools won’t be connected."
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  service: { paddingVertical: 14, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  grow: { flex: 1, minWidth: 0 },
  label: { ...font.row, fontSize: 16, fontWeight: '600' },
  status: { ...font.caption, marginTop: 2 },
  detail: { ...font.footnote, marginTop: 6, marginLeft: 49 },
  noteText: { ...font.footnote },
  select: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  connect: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center' },
  connectText: { fontSize: 13, fontWeight: '600' },
  unavailable: { ...font.footnote },
  note: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  other: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  otherText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.15 },
});
