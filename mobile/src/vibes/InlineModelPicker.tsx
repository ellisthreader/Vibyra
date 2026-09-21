import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, findNodeHandle, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { AUTO } from '../ui/agents';
import { BrandLogo } from '../ui/BrandLogo';
import { Icon } from '../ui/primitives';
import { detent } from '../ui/haptics';
import { useReducedMotion } from '../ui/useReducedMotion';
import { ComposerPickerRow, PickerControl } from './ComposerPickerRow';
import { usePickerSpace } from './usePickerSpace';
import { usePickerBack } from './usePickerBack';

export interface InlinePickerModel { id: string; name: string; locked?: boolean; fresh?: boolean }
export interface InlinePickerCompany { vendor: string; name: string; models: InlinePickerModel[] }
const PAGE = 4;
/** Option A's shared presentation; each caller owns its catalogue and selection rules. */
export function InlineModelPicker({ selection, companies, automatic = true, disabled = false, notice, emptyLabel,
  onSelect, onClose, onUpgrade }: {
  selection: string; companies: InlinePickerCompany[]; automatic?: boolean; disabled?: boolean;
  notice?: ReactNode; emptyLabel?: string;
  onSelect(id: string): void | Promise<boolean>; onClose(): void; onUpgrade?(): void;
}) {
  const { colors, dark } = useTheme(); const reduced = useReducedMotion();
  const [vendor, setVendor] = useState<string | null>(null);
  const [page, setPage] = useState(0); const [query, setQuery] = useState(''); const [searching, setSearching] = useState(false);
  const { maximum, fontScale } = usePickerSpace(searching ? 216 : 160);
  const [blocked, setBlocked] = useState<InlinePickerModel | null>(null); const pending = useRef(false);
  const company = companies.find(item => item.vendor === vendor);
  const search = query.trim().toLowerCase();
  const matches = (model: InlinePickerModel, name: string) => `${name} ${model.name} ${model.id}`.toLowerCase().includes(search);
  const foundCompanies = companies.filter(item => !search || item.models.some(model => matches(model, item.name)));
  const foundModels = company?.models.filter(model => !search || matches(model, company.name)) ?? [];
  const count = company ? foundModels.length : foundCompanies.length;
  const pages = Math.max(1, Math.ceil(count / PAGE)); const shownPage = Math.min(page, pages - 1);
  const list = useRef<ScrollView>(null); const shift = useRef(new Animated.Value(0)).current;
  const heading = useRef<Text>(null);
  const searchInput = useRef<TextInput>(null);
  const dismiss = () => {
    if (!reduced) LayoutAnimation.configureNext({ duration: 220, update: { type: 'easeInEaseOut' } });
    onClose();
  };
  const change = (next: () => void, direction = 1) => {
    if (!reduced) LayoutAnimation.configureNext({ duration: 260, update: { type: 'spring', springDamping: 0.9 } });
    setBlocked(null); next(); list.current?.scrollTo({ y: 0, animated: false });
    shift.stopAnimation(); shift.setValue(reduced ? 0 : direction * 12);
    if (!reduced) Animated.spring(shift, { toValue: 0, speed: 26, bounciness: 0, useNativeDriver: true }).start();
    detent();
  };
  const back = () => change(() => { setVendor(null); setPage(0); setQuery(''); }, -1);
  const toggleSearch = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setSearching(!searching); setQuery(''); setPage(0); setBlocked(null);
  };
  usePickerBack(vendor ? back : dismiss);
  useEffect(() => {
    if (Platform.OS === 'web' || searching) return;
    const timer = setTimeout(() => { const node = findNodeHandle(heading.current); if (node) AccessibilityInfo.setAccessibilityFocus(node); }, reduced ? 0 : 280);
    return () => clearTimeout(timer);
  }, [company?.name, reduced, searching]);
  const choose = async (model?: InlinePickerModel) => {
    if (disabled || pending.current) return;
    if (model?.locked) { change(() => setBlocked(model)); return; }
    pending.current = true;
    try { detent(); if (await onSelect(model?.id ?? AUTO) !== false) dismiss(); }
    finally { pending.current = false; }
  };
  const first = shownPage * PAGE;
  const rowCount = Math.min(PAGE, count - first) + (automatic && !company && !search && shownPage === 0 ? 1 : 0);
  const preferred = Math.max(144, 56 * fontScale + rowCount * Math.max(46, 21 * fontScale + 12)
    + (notice ? 64 * fontScale : 0) + (pages > 1 ? 44 : 0) + (searching ? 54 : 0) + (blocked ? 112 * fontScale : 0));
  return <View accessibilityLabel="Choose your AI" role="region" onAccessibilityEscape={vendor ? back : dismiss}
    style={[s.panel, { height: Math.min(maximum, preferred) }]}>
    <View style={s.header}>
      {company && <PickerControl label="Back to companies" onPress={back}><Icon name="chevron-back" size={20} /></PickerControl>}
      {company && <BrandLogo vendor={company.vendor} size={30} bare />}
      <View style={s.heading}><Text ref={heading} accessibilityRole="header" style={[s.title, { color: colors.text }]}>{company?.name ?? 'Choose company'}</Text></View>
      <PickerControl label={searching ? 'Hide model search' : 'Search AI models'} active={searching} onPress={toggleSearch}>
        <Icon name="search-outline" size={20} color={searching ? colors.accent : colors.muted} /></PickerControl>
      <PickerControl label="Close model picker" onPress={dismiss}><Icon name="close" size={20} /></PickerControl>
    </View>
    {searching && <View style={[s.search, { borderColor: colors.border }]}>
      <Icon name="search-outline" size={18} color={colors.muted} />
      <TextInput ref={searchInput} autoFocus accessibilityLabel="Search AI models" value={query} onChangeText={value => { setQuery(value); setPage(0); setBlocked(null); }}
        placeholder={company ? `Search ${company.name}` : 'Search companies or models'} placeholderTextColor={colors.muted}
        autoCorrect={false} autoCapitalize="none" returnKeyType="search" keyboardAppearance={dark ? 'dark' : 'light'}
        selectionColor={colors.accent} style={[s.searchInput, { color: colors.text }]} />
      {!!query && <PickerControl label="Clear search" onPress={() => { setQuery(''); setPage(0); searchInput.current?.focus(); }}><Icon name="close-circle" size={18} color={colors.muted} /></PickerControl>}
    </View>}
    <Animated.View style={[s.content, { transform: [{ translateX: shift }] }]}>
      <ScrollView ref={list} keyboardShouldPersistTaps="handled" contentContainerStyle={s.rows} showsVerticalScrollIndicator
        onContentSizeChange={() => { if (blocked) list.current?.scrollToEnd({ animated: !reduced }); }}>
        {automatic && !company && !search && shownPage === 0 && <ComposerPickerRow name="Auto" selected={selection === AUTO} disabled={disabled} onPress={() => void choose()} />}
        {company ? foundModels.slice(first, first + PAGE).map(model => <ComposerPickerRow key={model.id} name={model.name}
          label={`${model.name}${model.fresh ? ', new' : ''}${model.locked ? ', membership needed' : ''}`}
          vendor={company.vendor} locked={model.locked} selected={selection === model.id} disabled={disabled} onPress={() => void choose(model)} />)
          : foundCompanies.slice(first, first + PAGE).map(item => <ComposerPickerRow key={item.vendor} name={item.name} vendor={item.vendor} company
            onPress={() => change(() => { setVendor(item.vendor); setPage(0); setQuery(''); })} />)}
        {count === 0 && <Text style={[s.empty, { color: colors.muted }]}>{search ? 'No models found' : emptyLabel ?? 'More models will appear when available.'}</Text>}
        {notice && <View accessibilityLiveRegion="polite" style={s.notice}>{notice}</View>}
        {blocked && <View accessibilityLiveRegion="polite" style={s.blocked}>
          <Text style={[s.subtitle, { color: colors.text }]}>{blocked.name} · Included with a membership</Text>
          {onUpgrade && <Pressable accessibilityRole="button" onPress={() => { onClose(); onUpgrade(); }} style={s.plans}>
            <Text style={[s.more, { color: colors.accent }]}>See plans</Text></Pressable>}
        </View>}
      </ScrollView>
    </Animated.View>
    {pages > 1 && <View style={[s.footer, { borderTopColor: colors.border }]}>
      <PickerControl label={company ? 'Previous models' : 'Previous companies'} disabled={shownPage === 0}
        onPress={() => change(() => setPage(shownPage - 1), -1)}><Icon name="chevron-back" size={20} /></PickerControl>
      <Text accessibilityLiveRegion="polite" style={[s.page, { color: colors.muted }]}>{shownPage + 1} of {pages}</Text>
      <PickerControl label={company ? 'Next models' : 'Next companies'} disabled={shownPage === pages - 1}
        onPress={() => change(() => setPage(shownPage + 1))}><Icon name="chevron-forward" size={20} /></PickerControl>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  panel: { overflow: 'hidden' }, header: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, paddingLeft: 8, paddingBottom: 5 },
  heading: { flex: 1, minWidth: 0 }, title: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.35 },
  subtitle: { fontSize: 12, lineHeight: 17 }, content: { flex: 1 }, rows: { paddingVertical: 3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginVertical: 5, paddingLeft: 12, paddingRight: 4 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 16, paddingVertical: 10, borderWidth: 0, outlineWidth: 0, outlineStyle: 'solid', outlineColor: 'transparent' }, empty: { padding: 16, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  page: { fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  notice: { padding: 8, gap: 4 }, more: { fontSize: 13, fontWeight: '500' }, blocked: { padding: 10, borderRadius: 14, gap: 4 }, plans: { minHeight: 44, justifyContent: 'center' },
});
