import { useRef } from 'react';
import { View } from 'react-native';
import { PROFILE_MAX, type ProfileField as Part } from '../../vibes/preferencesApi';
import type { Personalization, PersonalizationState } from '../personalization';
import { Group, Label } from '../SettingsRows';
import { ProfileField } from './ProfileField';
import { SummaryPreview } from './SummaryPreview';
import { useTextDraft } from './useTextDraft';

/**
 * What the person tells Vibyra about themselves: a name, an occupation, more about
 * them, and the long memory summary. Each has its own switch; with memory off they
 * all keep their words but can't be switched on. A box that gains focus is brought
 * up to the top of the page (`onReveal`), because the keyboard covers the lower half.
 */
export function AboutYou({ store, state, memoryOn, onOpenSummary, onReveal, onTouch }: {
  store: Personalization; state: PersonalizationState; memoryOn: boolean;
  onOpenSummary: () => void; onReveal: (y: number) => void; onTouch: () => void;
}) {
  const preferences = state.preferences!;
  const drafts = { name: useTextDraft(store, state, 'name'), occupation: useTextDraft(store, state, 'occupation'),
    about: useTextDraft(store, state, 'about') };
  // Where the card starts on the page, and where each part starts inside it.
  const top = useRef(0);
  const at = useRef<Partial<Record<Part, number>>>({});
  const reveal = (part: Part) => { onTouch(); setTimeout(() => onReveal(top.current + (at.current[part] ?? 0)), 280); };
  const field = (part: Part) => ({ on: preferences[`${part}Enabled`], disabled: !memoryOn,
    onSwitch: (on: boolean) => { onTouch(); void store.setSwitch(`${part}Enabled`, on); },
    onLayout: (event: { nativeEvent: { layout: { y: number } } }) => { at.current[part] = event.nativeEvent.layout.y; } });
  return <>
    <Label>About you</Label>
    <View onLayout={event => { top.current = event.nativeEvent.layout.y; }}>
      <Group>
        <ProfileField title="Name" {...field('name')} draft={drafts.name} max={PROFILE_MAX.name}
          placeholder="What should Vibyra call you?" onFocus={() => reveal('name')} />
        <ProfileField title="Occupation" {...field('occupation')} draft={drafts.occupation} max={PROFILE_MAX.occupation}
          placeholder="What do you do?" onFocus={() => reveal('occupation')} />
        <ProfileField title="More about you" {...field('about')} draft={drafts.about} max={PROFILE_MAX.about} countFrom={1300}
          multiline placeholder="Interests, values or preferences to keep in mind" onFocus={() => reveal('about')} />
        <ProfileField title="Memory summary" {...field('summary')}>
          <SummaryPreview summary={preferences.summary} onOpen={onOpenSummary} />
        </ProfileField>
      </Group>
    </View>
  </>;
}
