import { NewSkill } from './NewSkill';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import type { AgentsApi, AgentSkill, TeammateFields } from '../types';
import { SetupCard, SetupField, SetupHeading } from './SetupForm';
import { font } from '../../ui/font';

export function SetupCapabilities({
  kind,
  api,
  fields,
  disabled,
  onChange,
  storage,
  onEditing,
}: {
  storage: string;
  onEditing(value: boolean): void;
  kind: 'skills';
  api: AgentsApi;
  fields: TeammateFields;
  disabled: boolean;
  onChange(patch: Partial<TeammateFields>): void;
}) {
  const { colors } = useTheme();
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError('');
    const request = api.skills?.().then((rows) => {
      if (alive) setSkills(rows);
    });
    if (!request) {
      setLoaded(true);
      return;
    }
    void request
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch(() => {
        if (alive) setError('Could not load your choices. Your saved selection is unchanged.');
      });
    return () => {
      alive = false;
    };
  }, [api, kind, retry]);
  const row = (
    id: string,
    title: string,
    detail: string,
    selected: boolean,
    first: boolean,
    available = true,
  ) => (
    <Pressable
      key={id}
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      aria-checked={selected}
      accessibilityState={{ checked: selected, disabled: disabled || !available }}
      disabled={disabled || !available}
      onPress={() =>
        onChange({
          skillIds: selected
            ? (fields.skillIds ?? []).filter((value) => value !== id)
            : [...(fields.skillIds ?? []), id].slice(0, 20),
        })
      }
      style={({ pressed }) => [
        s.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        {
          opacity: available ? 1 : 0.5,
          backgroundColor: pressed ? colors.elevated : 'transparent',
        },
      ]}
    >
      <View style={s.grow}>
        <Text style={[s.title, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>
          {detail}
        </Text>
      </View>
      <Icon
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.accent : colors.muted}
      />
    </Pressable>
  );
  const shown = skills.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <View style={s.body}>
      <SetupHeading
        title="Skills"
        description="Reusable instructions from your library. Skills do not grant access to services."
      />
      <NewSkill
        api={api}
        storage={storage}
        disabled={disabled || (fields.skillIds?.length ?? 0) >= 20}
        onEditing={onEditing}
        onSaved={(skill) => {
          setSkills((rows) => [skill, ...rows.filter((s) => s.id !== skill.id)]);
          setQuery('');
          onChange({
            skillIds: Array.from(new Set([...(fields.skillIds ?? []), skill.id])).slice(0, 20),
          });
        }}
      />
      <SetupField
        label="Find a skill"
        accessibilityLabel="Search choices"
        value={query}
        onChangeText={setQuery}
        placeholder="Search your library…"
      />
      {shown.length > 0 && (
        <SetupCard>
          {shown.map((skill, i) =>
            row(
              skill.id,
              skill.name,
              skill.instructions,
              (fields.skillIds ?? []).includes(skill.id),
              i === 0,
            ),
          )}
        </SetupCard>
      )}
      {!loaded && !error && <Hint>Loading choices…</Hint>}
      {loaded && kind === 'skills' && !skills.length && (
        <Hint>No skills yet. Create your first skill above.</Hint>
      )}
      {error && (
        <>
          <Hint error>{error}</Hint>
          <Button secondary title="Try again" onPress={() => setRetry((n) => n + 1)} />
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 20 },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  grow: { flex: 1 },
  title: { ...font.row, fontSize: 16 },
  detail: { ...font.footnote, marginTop: 3 },
});
