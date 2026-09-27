import { styles as s } from './AgentSheetStyles';
import { pickerModels } from './pickerModels';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { CompanyGroup } from './CompanyGroup';
import { groupCompanies, matches, SEARCH_LIMIT } from './modelGroups';
import { Button, Icon } from './primitives';
import { ModelPickerSheet } from './ModelPickerSheet';
import { AUTO } from './agents';
import type { VibesModel } from '../vibes/types';

export function AgentSheet({
  visible,
  onClose,
  selection,
  onSelect,
  models,
  paid,
  onUpgrade,
}: {
  visible: boolean;
  onClose(): void;
  selection: string;
  onSelect(id: string): void;
  models: VibesModel[];
  paid: boolean;
  onUpgrade?(): void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // A locked model is not a choice, so tapping one says what would unlock it
  // rather than selecting something that would be refused at send time.
  const [blocked, setBlocked] = useState<VibesModel | null>(null);
  // Apply the current branded shortlist before search, counts and grouping.
  const offered = useMemo(() => pickerModels(models), [models]);
  const search = query.trim().toLowerCase();
  // One clock for the whole sheet, so every "New" badge agrees and no row
  // re-renders merely because time passed while it was open.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (visible) setNow(Date.now());
  }, [visible]);
  useEffect(() => {
    if (!visible) setBlocked(null);
  }, [visible]);
  // The cap is applied before grouping: a one-letter search matches hundreds of
  // models, and the sheet mounts every row it is handed.
  const companies = useMemo(
    () =>
      groupCompanies(
        search ? offered.filter((model) => matches(model, search)).slice(0, SEARCH_LIMIT) : offered,
        now,
      ),
    [offered, search, now],
  );
  const choose = (id: string) => {
    onSelect(id);
    setQuery('');
    onClose();
  };
  // Pinned under the title rather than scrolled with the list: with hundreds of
  // models, a search that leaves the screen is a search nobody uses.
  const find = offered.length > 8 && (
    <View style={s.stick}>
      <View style={[s.search, { backgroundColor: colors.elevated }]}>
        <Icon name="search-outline" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setBlocked(null);
          }}
          accessibilityLabel="Search AI models"
          placeholder="Search models or providers"
          autoCapitalize="none"
          returnKeyType="search"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={[s.searchInput, { color: colors.text }]}
        />
        {!!search && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
            hitSlop={8}
            style={({ pressed }) => [
              s.clear,
              { backgroundColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Icon name="close" size={13} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
  return (
    <ModelPickerSheet
      search={find}
      visible={visible}
      onClose={onClose}
      footer={
        blocked && (
          <View style={s.blocked}>
            <View style={[s.blockedIcon, { backgroundColor: colors.accentSoft }]}>
              <Icon name="lock-closed" size={17} color={colors.accent} />
            </View>
            <View style={s.text}>
              <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
                {blocked.name}
              </Text>
              <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>
                Included with a membership
              </Text>
            </View>
            {onUpgrade && (
              <Button
                title="See plans"
                onPress={() => {
                  setBlocked(null);
                  onClose();
                  onUpgrade();
                }}
              />
            )}
          </View>
        )
      }
    >
      {/* Auto shares the list surface; its mark and selection carry the accent. */}
      {!search && (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel="Auto"
          aria-checked={selection === AUTO}
          accessibilityState={{ checked: selection === AUTO }}
          onPress={() => choose(AUTO)}
          style={({ pressed }) => [
            s.company,
            { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View style={[s.auto, { backgroundColor: colors.accentSoft }]}>
            <Icon name="sparkles" size={22} color={colors.accent} />
          </View>
          <View style={s.text}>
            <Text style={[s.name, { color: colors.text }]}>Auto</Text>
            <Text style={[s.detail, { color: colors.muted }]}>
              Let Vibyra choose for each message
            </Text>
          </View>
          <View
            style={[
              s.selection,
              {
                borderColor: selection === AUTO ? colors.accent : colors.border,
                backgroundColor: selection === AUTO ? colors.accent : 'transparent',
              },
            ]}
          >
            {selection === AUTO && <Icon name="checkmark" size={13} color={colors.onAction} />}
          </View>
        </Pressable>
      )}
      {!search && <Text style={[s.section, { color: colors.muted }]}>By provider</Text>}
      {companies.map((company) => (
        <CompanyGroup
          key={company.vendor}
          company={company}
          selection={selection}
          paid={paid}
          now={now}
          // Searching opens every company that still has a match, so results are never hidden.
          expanded={Boolean(search) || open === company.vendor}
          onToggle={() => setOpen(open === company.vendor ? null : company.vendor)}
          onSelect={choose}
          onLocked={setBlocked}
        />
      ))}
      {search && !companies.length && (
        <View style={s.empty}>
          <Icon name="search-outline" size={28} color={colors.muted} />
          <Text style={[s.name, { color: colors.text }]}>No models found</Text>
          <Text style={[s.hint, { color: colors.muted }]}>
            Try a different model or provider name.
          </Text>
        </View>
      )}
    </ModelPickerSheet>
  );
}
