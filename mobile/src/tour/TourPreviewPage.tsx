import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectFlow } from '../connection/ConnectFlow';
import { ProjectTerminalLauncher } from '../ui/ProjectTerminalLauncher';
import type { Project, TerminalModelCatalogue, WorkspaceModel } from '../ui/types';
import { settle } from './tourMotion';
import type { TourScene } from './tourSteps';

const project: Project = { id: 'walkthrough-project', name: 'Example project', path: '/walkthrough' };
const catalogue: TerminalModelCatalogue = {
  models: [
    { id: 'openai/codex', name: 'Codex', kind: 'codex', isNew: false },
    { id: 'anthropic/claude-code', name: 'Claude Code', kind: 'claude', isNew: false },
    { id: 'google/gemini', name: 'Gemini', kind: 'gemini', isNew: false },
  ],
  runnerKinds: ['codex', 'claude', 'gemini'],
  permissionModes: ['standard', 'full'], permissionsVersion: 1, effortVersion: 1,
};
const listModels = async () => catalogue;

/**
 * The real New terminal screen (with each way of paying for AI) and the real computer
 * setup, on a local sample project. Nothing on them can launch, ask for consent or
 * save a choice. `top` leaves room for the walkthrough card above; each screen fades
 * in as the card moves on, rather than cutting.
 */
export function TourPreviewPage({ stage, workspace, top, instant, onExit }: {
  stage: TourScene; workspace: WorkspaceModel; top: number; instant: boolean; onExit(): void;
}) {
  const { bottom } = useSafeAreaInsets();
  const preview: WorkspaceModel = useMemo(() => ({
    ...workspace, demo: true, status: 'connected', viewOnly: false,
    host: { id: 'walkthrough-computer', name: 'Example computer', platform: 'macos' },
    projects: [project], terminalModelsAvailable: true, fundedTerminalsAvailable: true,
    actions: { ...workspace.actions, listTerminalModels: listModels,
      createSession: async () => { throw new Error('The walkthrough cannot start a terminal.'); } },
  }), [workspace]);
  return <View style={[s.page, { paddingTop: top, paddingBottom: bottom }]}>
    <Fade key={stage} instant={instant}>
      {stage === 'connect' ? <ConnectFlow workspace={workspace} onClose={onExit} onConnected={onExit} />
        : <ProjectTerminalLauncher workspace={preview} project={project} tourPreview
          tourInitialSource={stage === 'funding' ? 'vibyra' : 'accounts'} onConnect={() => {}} onOpenSession={() => {}} />}
    </Fade>
  </View>;
}

/** A screen that eases in when it mounts, so moving between stops never cuts. */
function Fade({ children, instant }: { children: ReactNode; instant: boolean }) {
  const shown = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    if (instant) shown.setValue(1);
    else Animated.timing(shown, { toValue: 1, duration: 320, delay: 60, easing: settle, useNativeDriver: true }).start();
  }, [shown, instant]);
  return <Animated.View style={[s.body, { opacity: shown,
    transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  page: { flex: 1 },
  body: { flex: 1, minHeight: 0 },
});
