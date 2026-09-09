import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ConnectionModal } from '../connection/ConnectionModal';
import { useTheme } from '../theme';
import { ConnectSetup } from '../connection/ConnectSetup';
import { ConnectingStep } from '../connection/ConnectingStep';
import { DiscoveryStep } from '../connection/DiscoveryStep';
import { PairingForm } from '../connection/PairingForm';
import type { NearbyComputer } from '../connection/discoveryTypes';
import { TextLink } from '../onboarding/OnboardingScaffold';
import type { WorkspaceModel } from './types';

export function ConnectScreen({ visible, workspace, onClose }: {
  visible: boolean; workspace: WorkspaceModel; onClose: () => void;
}) {
  // A fresh sheet starts at setup, with no network work or camera access.
  return visible ? <ConnectionModal onClose={onClose}>
    <ConnectFlow workspace={workspace} onClose={onClose} />
  </ConnectionModal> : null;
}
function ConnectFlow({ workspace, onClose }: { workspace: WorkspaceModel; onClose: () => void }) {
  const { colors } = useTheme();
  const [page, setPage] = useState<'setup' | 'search' | 'connect' | 'code'>('setup');
  const [computer, setComputer] = useState<NearbyComputer>();
  const [named, setNamed] = useState<string>();
  const code = (name?: string) => { setNamed(name); setPage('code'); };
  if (page === 'setup') return <ConnectSetup onInstalled={() => setPage('search')} onPair={() => code()} />;
  if (page === 'search') {
    return <DiscoveryStep onSelect={found => { setComputer(found); setPage('connect'); }}
      onBack={() => setPage('setup')} />;
  }
  if (page === 'connect' && computer) {
    return <ConnectingStep workspace={workspace} computer={computer} onDone={onClose}
      onSearch={() => setPage('search')} />;
  }
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Pair your computer</Text>
    <PairingForm workspace={workspace} onClose={onClose} computerName={named} />
    <TextLink title="Back to computer search" onPress={() => setPage('search')}
      disabled={workspace.status === 'connecting' || workspace.status === 'pairing'} />
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 14, paddingBottom: 24, gap: 18 },
  title: { fontSize: 32, lineHeight: 37, fontWeight: '700', letterSpacing: -1 },
});
