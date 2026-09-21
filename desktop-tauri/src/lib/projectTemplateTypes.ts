/**
 * The shape of a project template. Data only: `templates.ts` holds the catalog
 * and `command.ts` turns a pick into the steps the computer runs.
 *
 * The phone keeps the same vocabulary in `mobile/src/scaffold/types.ts`, kept
 * in step so a project started from the phone is the same project the computer
 * would have started. The two files are diffed against each other; change both.
 * Adding a stack is one entry in a catalog file; nothing else is wired up for it.
 */
export type ProjectKind = 'website' | 'webapp' | 'mobile' | 'desktop' | 'game' | 'backend' | 'library' | 'ai' | 'empty';

/** Executables a template needs on the computer's PATH. Checked before a stack is offered. */
export type ToolId = 'node' | 'npm' | 'npx' | 'git' | 'cargo' | 'go' | 'python3' | 'composer' | 'rails' | 'flutter';

/** `parent` runs beside the project folder, for creators that make the folder
 *  themselves. `project` runs inside it. */
export type StepCwd = 'parent' | 'project';

/** `install` steps are skipped when dependencies are turned off. */
export type StepPhase = 'create' | 'install';

export interface TemplateStep {
  /** Shown while this step runs: "Creating the app", "Installing packages". */
  label: string;
  program: string;
  args: string[];
  cwd: StepCwd;
  phase: StepPhase;
}

/** A file written into the project before any step runs. Paths are relative
 *  and checked again on the computer; a template only seeds a few small files. */
export interface TemplateSeed { path: string; body: string }

export interface ProjectTemplate {
  id: string;
  /** A template can answer more than one question (Next.js is both a website
   *  and a web app), so kinds is a list rather than one value. */
  kinds: ProjectKind[];
  name: string;
  blurb: string;
  requires: ToolId[];
  steps: TemplateStep[];
  seeds: TemplateSeed[];
  /** Where to get the missing toolchain, named when preflight says it is absent. */
  docs: string;
}

export interface KindSpec { id: ProjectKind; name: string; blurb: string }

export interface TemplateOptions {
  /** Run the template's `install` steps. */
  install: boolean;
  /** `git init` in the finished folder, unless the template made a repo. */
  git: boolean;
  /** Open a terminal in the project once it is built. */
  openTerminal: boolean;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = { install: true, git: true, openTerminal: true };
