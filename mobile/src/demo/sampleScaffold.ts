import type { ScaffoldActions, ScaffoldEvent, ScaffoldStatus } from '../scaffold/api';
import type { Project } from '../ui/types';

/**
 * The sample computer building a project: the same events a real Host sends,
 * from timers instead of processes. Every catalogued tool is present except
 * Flutter and Rails, so a row that needs one shows what a missing toolchain
 * looks like. The folder that results is added to the sample's projects.
 */
const HOME = '/Users/you';
const STEP_PAUSE = 700;

export function sampleScaffold(addProject: (project: Project) => void): ScaffoldActions {
  const listeners = new Set<(event: ScaffoldEvent) => void>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let status: ScaffoldStatus | null = null;
  const emit = (event: ScaffoldEvent) => { for (const listener of listeners) listener(event); };
  const later = (delay: number, work: () => void) => { timers.push(setTimeout(work, delay)); };
  const stop = () => { for (const timer of timers.splice(0)) clearTimeout(timer); };
  const projectFor = (dir: string): Project => {
    const leaf = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? 'project';
    return { id: `demo-${leaf}`, name: leaf, path: dir.startsWith(HOME) ? `~${dir.slice(HOME.length)}` : dir };
  };
  const finish = (ok: boolean, message: string | null, project: Project | null) => {
    if (!status) return;
    status = { ...status, phase: ok ? 'done' : message === 'Cancelled.' ? 'cancelled' : 'failed', progress: null, error: message, project };
    if (project) addProject(project);
    emit({ type: 'done', runId: status.runId, ok, message, stalled: false, project });
  };
  return {
    preflight: async tools => ({
      tools: Object.fromEntries(tools.map(tool => [tool, tool !== 'flutter' && tool !== 'rails'])),
      home: HOME, parent: `${HOME}/Projects`,
    }),
    start: async (runId, plan) => {
      stop();
      status = { runId, dir: plan.dir, phase: 'running', progress: null, lines: [], error: null, project: null };
      let at = 300;
      plan.steps.forEach((step, index) => {
        later(at, () => {
          if (status?.runId !== runId) return;
          status = { ...status, progress: { index, total: plan.steps.length, label: step.label } };
          emit({ type: 'step', runId, index, total: plan.steps.length, label: step.label });
        });
        const lines = [`$ ${[step.program, ...step.args].join(' ')}`, 'Sample workspace: nothing is run.', `${step.label} · done`];
        later(at + STEP_PAUSE / 2, () => {
          if (status?.runId !== runId) return;
          status = { ...status, lines: [...status.lines, ...lines] };
          emit({ type: 'output', runId, lines });
        });
        at += STEP_PAUSE;
      });
      later(at + 200, () => { if (status?.runId === runId) finish(true, null, projectFor(plan.dir)); });
    },
    cancel: async runId => {
      if (status?.runId !== runId || status.phase !== 'running') return;
      stop();
      finish(false, 'Cancelled.', null);
    },
    status: async runId => {
      if (status?.runId !== runId) throw new Error('That build is not known to this computer.');
      return status;
    },
    adopt: async dir => { const project = projectFor(dir); addProject(project); return project; },
    follow: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
