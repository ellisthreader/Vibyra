import { ScrollView } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import type { SettingsPageProps } from '../pages';
import { HelpSection } from '../HelpSection';
import { requestTour } from '../../tour/tourRequests';
import { Group, Row } from '../SettingsRows';

export function HelpSettingsPage({ workspace, nav }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottom + 24 }}>
    <HelpSection workspace={workspace} showLogOut={false} />
    <Group style={{ marginTop: 14 }}>
      <Row title="Show walkthrough" detail="A quick guided look around the app" onPress={() => nav.close(requestTour)} />
      <Row title="Report a problem" onPress={() => nav.push('report')} />
    </Group>
  </ScrollView>;
}
