import { Pressable, StyleSheet, Text, View } from 'react-native';
import { integrationBrand } from '../../integrations/integrationBrands';
import type { Integration } from '../../integrations/types';
import { Mark } from '../../ui/BrandLogo';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/primitives';
import { font } from '../../ui/font';
import { toolDescriptions } from './toolDescriptions';

/** One service in the Tools card: its access checkbox, a Connect action, or Unavailable. */
export function SetupToolRow({
  app,
  first,
  checked,
  disabled,
  usable,
  busy,
  onToggle,
  onConnect,
}: {
  app: Integration;
  first: boolean;
  checked: boolean;
  disabled: boolean;
  usable: boolean;
  busy: boolean;
  onToggle(): void;
  onConnect(): void;
}) {
  const { colors } = useTheme();
  const canConnect = usable && app.credential.kind === 'oauth' && app.credential.configured;
  return (
    <View
      style={[
        s.service,
        !first && {
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
                : app.credential.kind === 'public' ? 'Ready · access off' : 'Connected · access off'
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
            onPress={onToggle}
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
            disabled={disabled || busy}
            onPress={onConnect}
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
      <Text style={[s.detail, { color: colors.muted }]}>{toolDescriptions[app.id] ?? app.tagline}</Text>
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
  select: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  connect: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center' },
  connectText: { fontSize: 13, fontWeight: '600' },
  unavailable: { ...font.footnote },
});
