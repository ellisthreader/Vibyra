import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { AboutYou } from '../memory/AboutYou';
import { SavedMemories } from '../memory/SavedMemories';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, SwitchRow } from '../SettingsRows';
import { usePersonalization } from '../usePersonalization';
import { sampleNote } from '../whose';
import { PageState } from './PageState';

/**
 * Everything Vibyra knows about the person, and whether it uses it: one switch for
 * all of memory, then what they wrote about themselves (each part with its own
 * switch), then the short memories they or a phone chat saved. The footnote says
 * plainly that all of it rides along with every message and so costs Vibes: that is
 * the one thing about memory a person could not work out from the page.
 */
export function MemoryPage({ workspace, nav }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const { store, state } = usePersonalization(workspace);
  const scroll = useRef<ScrollView>(null);
  // A refusal is shown under the part that was last touched, not wherever it is written.
  const [touched, setTouched] = useState<'about' | 'list'>('about');
  if (!store || state.status !== 'ready' || !state.preferences || !state.memories) {
    return <PageState feature="Memory" state={state} onRetry={() => void store?.load()} onSignIn={() => nav.signIn()} />;
  }
  const on = state.preferences.memoryEnabled;
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
    <Group style={s.first}>
      <SwitchRow title="Use memory" value={on} onChange={value => void store.setMemoryEnabled(value)} />
    </Group>
    <Footnote>{on ? 'Vibyra reads what’s switched on here in every phone chat, and saves what you ask it to remember. '
      + 'It’s sent with each message, so it counts toward Vibes.' : 'Memory is off. Vibyra won’t read or save anything here.'}</Footnote>
    <AboutYou store={store} state={state} memoryOn={on} onOpenSummary={() => nav.push('summary')} onTouch={() => setTouched('about')}
      onReveal={y => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })} />
    {state.error && touched === 'about' && <View style={s.error}><Hint error>{state.error}</Hint></View>}
    <SavedMemories store={store} state={state} error={touched === 'list' ? state.error : null} onTouch={() => setTouched('list')}
      onFocusEnd={() => scroll.current?.scrollToEnd({ animated: true })} />
    {workspace.demo && <Footnote>{sampleNote(workspace)}</Footnote>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  first: { marginTop: 8 },
  error: { marginTop: 10, marginHorizontal: 2 },
});
