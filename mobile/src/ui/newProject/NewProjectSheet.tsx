import { useEffect, useReducer } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { RAIL, STEP_TITLES } from '../../scaffold/flow';
import { plannedProject } from '../../scaffold/planned';
import { initialWizard, newRunId, wizardReducer } from '../../scaffold/wizard';
import { useAppear } from '../motion';
import { OverlaySheet } from '../OverlaySheet';
import { useReducedMotion } from '../useReducedMotion';
import type { Project, WorkspaceModel } from '../types';
import { KindStep } from './KindStep';
import { OptionsStep } from './OptionsStep';
import { ReviewStep } from './ReviewStep';
import { RunStep } from './RunStep';
import { StackStep } from './StackStep';
import { useProjectCreate } from './useProjectCreate';
import { WhereStep } from './WhereStep';

/**
 * Starting a project: the same questions Vibyra asks on the computer, asked
 * from the phone, with the computer doing the building. What are you making,
 * which stack, how should it be set up, what is it called and where does it
 * go, then a review of the exact commands, then the build. Every question
 * but the name can be skipped, and every path still reaches a folder.
 *
 * Kept rendered and toggled with `visible`, like Settings, so a build that
 * outlives the sheet keeps reporting into it.
 */
export function NewProjectSheet({ visible, workspace, onClose, onDone }: {
  visible: boolean; workspace: WorkspaceModel; onClose: () => void;
  /** The project is shared and can be entered; `openTerminal` is the option the person left on. */
  onDone: (project: Project, openTerminal: boolean) => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => initialWizard(newRunId()));
  const create = useProjectCreate(workspace, state, dispatch, visible, onDone);
  // Opening starts over, unless a build is still running: then it is shown as it stands.
  useEffect(() => { if (visible && state.phase !== 'running') dispatch({ type: 'reset', runId: newRunId() }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible]);
  const running = state.phase === 'running';
  const reached = RAIL.indexOf(state.step);
  const host = workspace.demo ? 'The sample computer' : workspace.host?.name ?? 'Your computer';
  return <OverlaySheet visible={visible} title={STEP_TITLES[state.step]} label="New project" testID="new-project-sheet" onClose={onClose}
    onBack={state.history.length > 0 && !running ? () => dispatch({ type: 'back' }) : undefined}>
    {reached >= 0 && <View style={s.rail} accessibilityLabel={`Step ${reached + 1} of ${RAIL.length}`} accessibilityRole="progressbar">
      {RAIL.map((step, index) => <View key={step} style={[s.segment, { backgroundColor: index <= reached ? colors.accent : colors.border }]} />)}
    </View>}
    <Step key={state.step} instant={reduced}>
      {state.step === 'kind' && <KindStep current={state.kind} onChoose={kind => dispatch({ type: 'chooseKind', kind })} />}
      {state.step === 'stack' && <StackStep kind={state.kind} tools={state.tools} selected={state.templateId}
        extras={state.extraIds} browsing={state.browsing}
        onChoose={templateId => dispatch({ type: 'chooseTemplate', templateId })}
        onToggleExtra={templateId => dispatch({ type: 'toggleExtra', templateId })}
        onContinue={() => dispatch({ type: 'continue' })} onBrowse={on => dispatch({ type: 'browseAll', on })} />}
      {state.step === 'options' && <OptionsStep templateId={state.templateId} options={state.options}
        onChange={patch => dispatch({ type: 'setOptions', patch })} onContinue={() => dispatch({ type: 'go', step: 'where' })} />}
      {state.step === 'where' && <WhereStep name={state.name} parent={state.parent} home={state.home}
        onName={name => dispatch({ type: 'setName', name })} onParent={parent => dispatch({ type: 'setParent', parent })}
        onContinue={() => dispatch({ type: 'go', step: 'review' })} />}
      {state.step === 'review' && <ReviewStep kind={state.kind} name={state.name} home={state.home} planned={plannedProject(state)}
        host={host} onCreate={() => void create.start()} />}
      {state.step === 'running' && <RunStep phase={state.phase} progress={state.progress} log={state.log} error={state.error}
        onCancel={create.cancel} onRetry={() => void create.start()} onOpenFolder={() => void create.adoptAsIs(false)}
        onOpenTerminal={() => void create.adoptAsIs(true)} onClose={onClose} />}
    </Step>
  </OverlaySheet>;
}

/** Each screen rises in rather than swapping in place. `instant` lands it at rest for Reduce Motion. */
function Step({ instant, children }: { instant: boolean; children: React.ReactNode }) {
  const appear = useAppear(instant);
  return <Animated.View style={[s.step, { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
    {children}
  </Animated.View>;
}
const s = StyleSheet.create({
  rail: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
  segment: { flex: 1, height: 3, borderRadius: 999 },
  step: { flex: 1, minHeight: 0 },
});
