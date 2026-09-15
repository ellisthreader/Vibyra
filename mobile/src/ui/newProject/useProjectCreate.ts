import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import type { ScaffoldEvent } from '../../scaffold/api';
import { plannedProject } from '../../scaffold/planned';
import { allRequiredTools } from '../../scaffold/templates';
import type { WizardAction, WizardState } from '../../scaffold/wizard';
import type { Project, WorkspaceModel } from '../types';

/**
 * The build itself: preflight when the sheet opens, the run, cancelling, and
 * the ways out of a failure. Kept out of the reducer so it stays a state
 * machine and this stays the one place that talks to the computer.
 */
export function useProjectCreate(workspace: WorkspaceModel, state: WizardState, dispatch: Dispatch<WizardAction>,
  visible: boolean, onDone: (project: Project, openTerminal: boolean) => void) {
  const scaffold = workspace.actions.scaffold;
  const latest = useRef({ state, workspace, visible, onDone });
  latest.current = { state, workspace, visible, onDone };
  const fail = useCallback((error: unknown) => dispatch({ type: 'run', patch: { phase: 'failed',
    error: error instanceof Error ? error.message : 'The project could not be built.' } }), [dispatch]);

  // Which toolchains the computer has, asked once per opening. A late answer
  // for a sheet that has since closed and reopened is dropped.
  useEffect(() => {
    if (!visible || !scaffold) return;
    let current = true;
    scaffold.preflight(allRequiredTools()).then(answer => {
      if (!current) return;
      dispatch({ type: 'preflight', tools: answer.tools, home: answer.home, parent: answer.parent,
        projectPaths: latest.current.workspace.projects.map(project => project.path) });
    }).catch(() => {});
    return () => { current = false; };
  }, [visible, scaffold, dispatch]);

  const finish = useCallback(async (event: Extract<ScaffoldEvent, { type: 'done' }>) => {
    const { workspace: live, state: now, visible: shown, onDone: done } = latest.current;
    if (!event.ok) {
      dispatch({ type: 'run', patch: { phase: event.stalled ? 'stalled' : 'failed', error: event.message ?? 'The project could not be built.' } });
      return;
    }
    // The folder is shared now; read the list back so the project can be entered.
    await live.actions.refresh().catch(() => {});
    const { destination } = plannedProject(now);
    const project = event.project ?? latest.current.workspace.projects.find(item => item.path === destination.path) ?? null;
    dispatch({ type: 'run', patch: { phase: 'done', project, progress: null } });
    // Closed mid-build: the project is in the list, and nothing is yanked open.
    if (project && shown) done(project, now.options.openTerminal);
  }, [dispatch]);

  // Events for the run in progress. Subscribed for the sheet's whole life, so
  // a build that outlives a closed sheet still lands in the state.
  useEffect(() => {
    if (!scaffold) return;
    return scaffold.follow(event => {
      const { state: now } = latest.current;
      if (event.runId !== now.runId || now.phase !== 'running') return;
      if (event.type === 'step') dispatch({ type: 'run', patch: { progress: { index: event.index, total: event.total, label: event.label } } });
      else if (event.type === 'output') dispatch({ type: 'log', lines: event.lines });
      else void finish(event);
    });
  }, [scaffold, dispatch, finish]);

  const start = useCallback(async () => {
    const { state: now } = latest.current;
    const { destination, request } = plannedProject(now);
    dispatch({ type: 'restart' });
    if (now.step !== 'running') dispatch({ type: 'go', step: 'running' });
    if (destination.error) { dispatch({ type: 'run', patch: { phase: 'failed', error: destination.error } }); return; }
    if (!scaffold) { dispatch({ type: 'run', patch: { phase: 'failed', error: 'Connect a computer that can start projects.' } }); return; }
    dispatch({ type: 'run', patch: { phase: 'running', error: null, progress: null } });
    try { await scaffold.start(now.runId, request); } catch (error) { fail(error); }
  }, [scaffold, dispatch, fail]);

  const cancel = useCallback(() => { void scaffold?.cancel(latest.current.state.runId).catch(fail); }, [scaffold, fail]);

  /** Shares the folder as it stands: after a stall, so the scaffolder can be
   *  finished in a terminal that has a keyboard, or after a partial failure. */
  const adoptAsIs = useCallback(async (withTerminal: boolean) => {
    const { state: now, onDone: done } = latest.current;
    if (!scaffold) return;
    try {
      const project = await scaffold.adopt(plannedProject(now).destination.path);
      dispatch({ type: 'run', patch: { phase: 'done', project } });
      done(project, withTerminal);
    } catch (error) { fail(error); }
  }, [scaffold, dispatch, fail]);

  return { start, cancel, adoptAsIs };
}
