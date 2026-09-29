import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { FundedModel } from '../vibes/types';
import { InlineModelPicker } from '../vibes/InlineModelPicker';
import { vendorOf } from './brands';
import { fundedCompanies, terminalCatalogModels } from './terminalCatalogPresentation';
import { ModelLogo } from './BrandLogo';
import { font } from './font';
import { Icon } from './primitives';

export function FundedTerminalModels({ models, selected, choose, disabled, onPickingChange, picking, browseOnly, loading, automatic, chooseAuto }: {
  automatic?: boolean; chooseAuto?(): void;
  models: FundedModel[]; selected?: FundedModel; choose(model: FundedModel): void; disabled: boolean; onPickingChange(open: boolean): void;
  picking: boolean; browseOnly: boolean; loading: boolean;
}) {
  const { colors } = useTheme();
  const companies = fundedCompanies(models, browseOnly);
  const cleanModels = terminalCatalogModels(models);
  const open = onPickingChange;
  const cards = companies.slice(0, 2).flatMap(company => {
    const model = cleanModels.find(m => vendorOf(m.id) === company.vendor && (browseOnly || m.available));
    return model ? [model] : [];
  });
  if (selected && !cards.some(m => m.id === selected.id)) cards.splice(0, 1, selected);
  if (picking) return <InlineModelPicker presentation="page" automatic={!!chooseAuto} automaticLabel="Vibyra Auto" automaticDetail="Picks the model and effort to match your message." companies={companies} selection={automatic ? 'auto' : selected?.id ?? ''}
    heading="All models" subtitle={loading ? undefined : `${cleanModels.length} models · ${companies.length} companies`}
    emptyLabel={loading ? 'Loading OpenRouter models…' : undefined}
    disabled={disabled} onClose={() => open(false)} onSelect={id => { if (id === 'auto') { chooseAuto?.(); return; } const model = models.find(m => m.id === id); if (model && (browseOnly || model.available)) choose(model); }} />;
  return <View style={s.section}>
    <View style={s.cards}>{cards.map(model => <Pressable key={model.id} accessibilityRole="radio" accessibilityLabel={`Select ${model.name}`}
      accessibilityState={{ checked: selected?.id === model.id, disabled }} aria-checked={selected?.id === model.id}
      disabled={disabled} onPress={() => choose(model)} style={[s.card, { borderColor: selected?.id === model.id ? colors.accent : colors.border,
        backgroundColor: selected?.id === model.id ? colors.accentSoft : colors.surface }]}>
      <View style={s.top}><ModelLogo id={model.id} size={40} />{selected?.id === model.id && <Icon name="checkmark-circle" size={20} color={colors.accent} />}</View>
      <Text style={[font.headline, { color: colors.text }]}>{model.name.replace(/^[^:]+: /, '')}</Text>
      <Text style={[font.footnote, { color: colors.accent }]}>Uses Vibyra tokens{model.tools ? '' : ' · Chat only'}</Text>
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="More models" onPress={() => open(true)} disabled={disabled} style={[s.more, automatic && { backgroundColor: colors.accentSoft, borderRadius: 12, paddingHorizontal: 12 }]}>
      <Icon name="grid-outline" size={18} color={colors.muted} /><Text style={[font.row, s.label, { color: colors.text }]}>More models</Text>
      <Text style={[font.footnote, { color: colors.muted }]}>{automatic ? 'Vibyra Auto' : cleanModels.length}</Text>{automatic && <Icon name="checkmark-circle" size={18} color={colors.accent} />}<Icon name="chevron-forward" size={15} color={colors.muted} />
    </Pressable>
    {selected && <Text style={[font.footnote, { color: colors.muted }]}>{selected.tools
      ? 'You approve each file read and edit.' : 'Chat only · this model cannot use computer tools.'}</Text>}
  </View>;
}
const s = StyleSheet.create({ section: { gap: 10 }, cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  more: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 }, label: { flex: 1 } });
