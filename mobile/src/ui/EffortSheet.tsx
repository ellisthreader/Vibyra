import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { effortChoice } from './effort';
import { Icon } from './primitives';
import { Sheet } from './Sheet';
import type { Effort, VibesModel } from '../vibes/types';

/**
 * How hard the model thinks before it answers. The rungs are the model's own:
 * OpenRouter publishes the exact ladder each one accepts, so this list is never
 * longer than what the provider would take. Thinking is billed like any other
 * output, so the cost of moving up the ladder is said out loud rather than
 * discovered on the bill.
 */
export function EffortSheet({ visible, onClose, model, selection, onSelect }: {
  visible: boolean; onClose(): void; model: VibesModel | undefined;
  selection: Effort | null; onSelect(effort: Effort): void;
}) {
  const { colors } = useTheme();
  const available = model?.reasoning?.efforts ?? [];
  const choose = (effort: Effort) => { onSelect(effort); onClose(); };
  return <Sheet title="Thinking effort" visible={visible} onClose={onClose}>
    <Text style={[s.hint, { color: colors.muted }]}>
      {model ? `How long ${model.name} thinks before it answers. More thinking costs more Vibes.`
        : 'How long the model thinks before it answers. More thinking costs more Vibes.'}
    </Text>
    <View style={[s.group, { borderColor: colors.border }]}>
      {available.map((effort, index) => {
        const choice = effortChoice(effort);
        const selected = selection === effort;
        return <Pressable key={effort} accessibilityRole="radio" accessibilityLabel={`${choice.label}, ${choice.hint}`}
          aria-checked={selected} accessibilityState={{ checked: selected }} onPress={() => choose(effort)}
          style={({ pressed }) => [s.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            { opacity: pressed ? 0.6 : 1 }]}>
          <View style={s.text}>
            <Text style={[s.name, { color: colors.text }]}>{choice.label}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{choice.hint}</Text>
          </View>
          {selected && <Icon name="checkmark" size={20} color={colors.accent} />}
        </Pressable>;
      })}
    </View>
    {/* A mandatory reasoner cannot be switched off, so the ladder has no floor. */}
    {model?.reasoning?.mandatory && <Text style={[s.footnote, { color: colors.muted }]}>
      {model.name} always thinks before it answers, so it cannot be turned off.</Text>}
  </Sheet>;
}
const s = StyleSheet.create({
  hint: { fontSize: 14, lineHeight: 21 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 60, paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '500' },
  detail: { fontSize: 12, lineHeight: 17 },
  footnote: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
