import { ScrollView } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { useAction } from '../../ui/useAction';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row, SwitchRow } from '../SettingsRows';

export function AdvancedPage({ workspace }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const { busy, error, run } = useAction();
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom + 24 }}>
    <Label first>Testing</Label>
    <Group>
      {(workspace.actions.enterDemo || workspace.demo) && <SwitchRow title="Sample workspace"
        value={Boolean(workspace.demo)}
        onChange={on => (on ? workspace.actions.enterDemo?.() : workspace.actions.exitDemo?.())} />}
      {workspace.actions.resetOnboarding && <Row title="Show welcome again" busy={busy}
        onPress={() => void run(() => workspace.actions.resetOnboarding!())} />}
    </Group>
    <Footnote>Explore the sample workspace or revisit the welcome screens.</Footnote>
    {error && <Hint error>{error}</Hint>}
  </ScrollView>;
}
