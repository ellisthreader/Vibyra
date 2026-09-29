import { Linking, ScrollView } from 'react-native';
import { useMobileAnalytics, useMobileAnalyticsConsent } from '../../analytics/mobileAnalytics';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import { links } from '../links';
import type { SettingsPageProps } from '../pages';
import { Footnote, Group, Label, Row, SwitchRow } from '../SettingsRows';

export function PrivacyPage({ workspace }: SettingsPageProps) {
  const analytics = useMobileAnalytics();
  const consent = useMobileAnalyticsConsent();
  const bottom = useSheetBottomInset();
  const enabled = consent.choice === 'aggregate' || consent.choice === 'linked';
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottom + 24 }}>
    <Label first>Product analytics</Label>
    <Group>
      <SwitchRow title="Share usage statistics" value={enabled} disabled={!analytics || consent.saving || !consent.ready}
        detail="Screens, feature actions, model counts and active time. No prompt text or project contents."
        onChange={on => { void analytics?.choose(on ? 'aggregate' : 'declined'); }} />
      {workspace.account && <SwitchRow title="Link usage to my account" value={consent.choice === 'linked'}
        disabled={!analytics || consent.saving || !enabled}
        detail="Optional account-level insights. Off unless you choose it."
        onChange={on => { void analytics?.choose(on ? 'linked' : 'aggregate'); }} />}
    </Group>
    <Footnote>You can change this choice any time. Turning usage statistics off stops collection on this device and asks Vibyra to erase identifiable analytics. Sign-in, purchases and security records are separate.</Footnote>
    {consent.error && <Hint error>{consent.error}</Hint>}
    <Label>Learn more</Label>
    <Group>
      <Row title="Privacy Policy" trailing="external" onPress={() => void Linking.openURL(links.privacy).catch(() => {})} />
      <Row title="Data access and removal" trailing="external" onPress={() => void Linking.openURL(links.dataRequests).catch(() => {})} />
    </Group>
  </ScrollView>;
}
