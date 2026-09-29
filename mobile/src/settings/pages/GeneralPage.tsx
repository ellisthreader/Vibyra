import { ScrollView } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import type { SettingsPageProps } from '../pages';
import { Group, Label, Row } from '../SettingsRows';
import { ThemePicker } from '../ThemePicker';
import { usePersonalization } from '../usePersonalization';

export function GeneralPage({ workspace, nav, routes }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const personal = usePersonalization(workspace, !!workspace.account || !!workspace.demo).rows;
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottom + 24 }}>
    <Label first>Appearance</Label>
    <ThemePicker theme={workspace.themePreference} accent={workspace.accent ?? 'cobalt'}
      onTheme={workspace.actions.setTheme} onAccent={workspace.actions.setAccent} />
    {(workspace.account || workspace.demo) && <>
      <Label>Personalization</Label>
      <Group>
        <Row title="Personality" value={personal.personality} onPress={() => nav.push('personality')} />
        {routes.agents && <Row title="Skills" onPress={() => nav.push('skills')} />}
        <Row title="Memory" value={personal.memory} onPress={() => nav.push('memory')} />
      </Group>
    </>}
    <Label>Privacy</Label>
    <Group><Row title="Usage and data" onPress={() => nav.push('privacy')} /></Group>
  </ScrollView>;
}
