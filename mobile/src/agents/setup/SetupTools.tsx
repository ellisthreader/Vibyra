import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIntegrations } from '../../integrations/IntegrationsProvider';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import { form, SetupCard, SetupField, SetupHeading, SetupSection } from './SetupForm';
import { font } from '../../ui/font';
import { SetupToolRow } from './SetupToolRow';
import { allowAfterConnect } from './allowAfterConnect';

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
    (app) => app.credential.kind !== 'device',
  );
  const usable = apps.live && apps.catalogue.enabled;
  // Services whose Connect flow just finished from this screen; they get the teammate's access
  // once the refreshed catalogue confirms they are installed. Failure or cancel never lands here.
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => {
    if (!connected.length) return;
    setConnected([]);
    const installed = apps.catalogue.integrations.filter((app) => app.installed).map((app) => app.id);
    const next = allowAfterConnect(selected, connected, installed, usable && !disabled);
    if (next !== selected) onChange(next);
  }, [connected, apps.catalogue, selected, usable, disabled, onChange]);
  return (
    <View style={form.body}>
      <SetupHeading title="Tools" description="Choose the services this teammate can work with." />
      <SetupSection label="Available services">
        <SetupCard>
          {available.map((app, index) => {
            const checked = selected.includes(app.id);
            return (
              <SetupToolRow
                key={app.id}
                app={app}
                first={index === 0}
                checked={checked}
                disabled={disabled}
                usable={usable}
                busy={apps.busy !== null}
                onToggle={() =>
                  onChange(
                    checked ? selected.filter((id) => id !== app.id) : [...selected, app.id],
                  )
                }
                onConnect={() => {
                  void apps
                    .authorize(app.id)
                    .then(() => setConnected((ids) => [...ids, app.id]))
                    .catch(() => {});
                }}
              />
            );
          })}
        </SetupCard>
      </SetupSection>
      <View style={s.note}>
        <Icon name="shield-checkmark-outline" size={16} color={colors.muted} />
        <Text style={[s.noteText, s.grow, { color: colors.muted }]}>
          Access is saved with the teammate. Save to let this teammate use it. Actions that change a
          service still need your approval.
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
  grow: { flex: 1, minWidth: 0 },
  noteText: { ...font.footnote },
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
