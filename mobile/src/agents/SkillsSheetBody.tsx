import { randomUUID } from 'expo-crypto';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { skillsSheetStyles as s } from './skillsSheetStyles';
import { SetupCard, SetupField, SetupHeading, SetupSection } from './setup/SetupForm';
import { TeammateAvatar } from './TeammateAvatar';
import type { AgentSkill, Teammate } from './types';

type Props = {
  current: AgentSkill | null;
  pending: AgentSkill | null;
  busy: boolean;
  error: string;
  skills: AgentSkill[];
  teammates: Teammate[];
  onDraft: Dispatch<SetStateAction<AgentSkill | null>>;
  onSave(): Promise<void>;
};

export function SkillsSheetBody({
  current,
  pending,
  busy,
  error,
  skills,
  teammates,
  onDraft,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const checked = (a: Teammate) => Boolean(current?.teammateIds.includes(a.id));
  const rowStyle = (i: number, pressed: boolean) => [
    s.row,
    i > 0 && {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pressed && { backgroundColor: colors.elevated },
  ];
  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {current ? (
        <>
          <SetupField
            label="Name"
            accessibilityLabel="Skill name"
            editable={!pending && !busy}
            value={current.name}
            onChangeText={(name) => onDraft({ ...current, name })}
            placeholder="e.g. Review checklist"
          />
          <SetupField
            label="Instructions"
            accessibilityLabel="Skill instructions"
            multiline
            maxLength={4000}
            editable={!pending && !busy}
            value={current.instructions}
            onChangeText={(instructions) => onDraft({ ...current, instructions })}
            placeholder="When to use it, the steps to follow, and the result to produce…"
          />
          <SetupSection label="Assign to teammates">
            <SetupCard>
              {teammates
                .filter((a) => !a.archived)
                .map((a, i) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={a.name}
                    accessibilityState={{
                      checked: checked(a),
                      disabled: Boolean(pending) || busy,
                    }}
                    aria-checked={checked(a)}
                    disabled={Boolean(pending) || busy}
                    onPress={() =>
                      onDraft({
                        ...current,
                        teammateIds: checked(a)
                          ? current.teammateIds.filter((id) => id !== a.id)
                          : [...current.teammateIds, a.id],
                      })
                    }
                    style={({ pressed }) => rowStyle(i, pressed)}
                  >
                    <TeammateAvatar avatar={a.avatar} size={30} />
                    <Text style={[s.name, { color: colors.text }]}>{a.name}</Text>
                    <Icon
                      name={checked(a) ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={checked(a) ? colors.accent : colors.muted}
                    />
                  </Pressable>
                ))}
            </SetupCard>
          </SetupSection>
          <Hint>Instructions do not grant tool access. Stop affected tasks before saving.</Hint>
          <View style={s.actions}>
            <Button
              title={pending ? 'Retry exact save' : 'Save skill'}
              busy={busy}
              disabled={!current.name.trim() || !current.instructions.trim()}
              onPress={() => void onSave()}
            />
            {!pending && <Button title="Back to skills" secondary onPress={() => onDraft(null)} />}
          </View>
        </>
      ) : (
        <>
          <SetupHeading
            title="Your skills"
            description="Reusable instructions your teammates can follow."
          />
          {skills.length > 0 && (
            <SetupCard>
              {skills.map((skill, i) => (
                <Pressable
                  key={skill.id}
                  accessibilityRole="button"
                  onPress={() => onDraft(skill)}
                  style={({ pressed }) => rowStyle(i, pressed)}
                >
                  <View style={[s.glyph, { backgroundColor: colors.elevated }]}>
                    <Icon name="layers-outline" size={16} color={colors.muted} />
                  </View>
                  <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
                    {skill.name}
                  </Text>
                  <Icon name="chevron-forward" size={15} color={colors.muted} />
                </Pressable>
              ))}
            </SetupCard>
          )}
          <Button
            title="New skill"
            icon="add"
            onPress={() =>
              onDraft({
                id: randomUUID(),
                revision: 0,
                name: '',
                instructions: '',
                teammateIds: [],
              })
            }
          />
        </>
      )}
      {error && <Hint error>{error}</Hint>}
    </ScrollView>
  );
}
