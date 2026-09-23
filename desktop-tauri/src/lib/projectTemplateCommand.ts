import { parentOf, pascalCase, slugify } from './projectDestination.ts';
import type { ProjectTemplate, TemplateOptions } from './projectTemplateTypes.ts';

// Turns one pick plus the option switches into the exact work the computer
// will do. Pure, so the review step can show the literal commands and a test
// can assert them without a computer.

export interface ScaffoldStepRequest {
  label: string; program: string; args: string[];
  /** Absolute. `parent` steps run beside the folder, `project` steps inside. */
  cwd: string;
}
export interface ScaffoldSeedRequest { path: string; body: string }
export interface ScaffoldRequest {
  dir: string;
  /** Created before any step; false when the scaffolder makes the folder. */
  createDir: boolean;
  seeds: ScaffoldSeedRequest[];
  steps: ScaffoldStepRequest[];
  gitInit: boolean;
}

// One thing every build was paying for and nothing was asking for.

/** npm's audit and funding passes are network round trips made after the
 *  install has already finished, and neither has anything to say about a
 *  project that is one second old.
 *
 *  A bare `npm install` before `npm install phaser` looks redundant, and
 *  collapsing the two is tempting — but measured, it is not the same work:
 *  npm skips optional dependencies on that path, and a Vite project without
 *  `fsevents` falls back to polling for file changes on macOS. Two passes it
 *  stays. */
const NPM_QUIET = ['--no-audit', '--no-fund'];

function isNpmInstall(step: ScaffoldStepRequest): boolean {
  return step.program === 'npm' && step.args[0] === 'install';
}

function quicken(steps: ScaffoldStepRequest[]): ScaffoldStepRequest[] {
  return steps.map(step => (isNpmInstall(step)
    ? { ...step, args: [...step.args, ...NPM_QUIET.filter(flag => !step.args.includes(flag))] }
    : step));
}

function fill(value: string, slug: string): string {
  return value.split('{{name}}').join(slug).split('{{Name}}').join(pascalCase(slug));
}

export function buildScaffoldRequest(entry: ProjectTemplate, dir: string, options: TemplateOptions,
  /** Stacks layered on top, in the order they were picked. Every one of these
   *  runs inside the folder the base made, so they simply follow its steps. */
  extras: ProjectTemplate[] = []): ScaffoldRequest {
  const slug = slugify(dir.split(/[\\/]/).filter(Boolean).pop() ?? '');
  const parent = parentOf(dir);
  const chosen = [entry, ...extras];
  const wanted = chosen.flatMap(pick => pick.steps.filter(step => step.phase === 'create' || options.install));
  const steps = quicken(wanted.map(step => ({ label: step.label, program: fill(step.program, slug),
    args: step.args.map(arg => fill(arg, slug)), cwd: step.cwd === 'parent' ? parent : dir })));
  // A scaffolder that makes its own folder must not find one already there:
  // some refuse outright, and the ones that do not still expect to own it.
  const createDir = !entry.steps.some(step => step.cwd === 'parent');
  return { dir, createDir,
    seeds: chosen.flatMap(pick => pick.seeds).map(seed => ({ path: seed.path, body: fill(seed.body, slug) })),
    steps, gitInit: options.git };
}

/** The commands as the setup step shows them: one line each, quoted the way a
 *  shell would need, though nothing is ever run through a shell.
 *
 *  `git init` is listed too. It is not one of the template's steps — the
 *  computer runs it after them, from `gitInit` — but a switch that is on and a
 *  command list that never mentions it reads as a switch that does nothing. */
export function describeSteps(request: ScaffoldRequest): string[] {
  const commands = request.steps.map(step => [step.program, ...step.args]
    .map(token => (/[\s"']/.test(token) ? JSON.stringify(token) : token)).join(' '));
  return request.gitInit ? [...commands, 'git init'] : commands;
}
