import { ScrollView } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { AppSection } from '../AppSection';
import type { SettingsPageProps } from '../pages';

export function ComputerSettingsPage({ workspace, nav, routes }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottom + 24 }}>
    <AppSection workspace={workspace} nav={nav} routes={routes} />
  </ScrollView>;
}
