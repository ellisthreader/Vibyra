/** The shape of a project template. Data only — see `projectTemplates.ts` for
 * the catalog and `projectTemplateCommand.ts` for turning a pick into steps.
 *
 * Adding a stack is one entry. Nothing else is wired up for it. */

export type ProjectKind =
  | "website"
  | "webapp"
  | "mobile"
  | "desktop"
  | "game"
  | "backend"
  | "library"
  | "ai"
  | "empty";

/** Executables a template needs on PATH. Checked before Create is offered. */
export type ToolId =
  | "node"
  | "npm"
  | "npx"
  | "git"
  | "cargo"
  | "go"
  | "python3"
  | "composer"
  | "rails"
  | "flutter";

/** `parent` runs beside the project folder — for creators that make the folder
 * themselves. `project` runs inside it. */
export type StepCwd = "parent" | "project";

/** `install` steps are skipped when the user turns dependencies off. */
export type StepPhase = "create" | "install";

export interface TemplateStep {
  /** Shown while this step runs: "Creating the app", "Installing packages". */
  label: string;
  program: string;
  args: string[];
  cwd: StepCwd;
  phase: StepPhase;
}

/** A file written into the project before any step runs. Paths are relative
 * and validated in Rust; a template only ever seeds a handful of small files. */
export interface TemplateSeed {
  path: string;
  body: string;
}

export interface ProjectTemplate {
  id: string;
  /** A template can answer more than one question — Next.js is both a website
   * and a web app — so kinds is a list rather than a single value. */
  kinds: ProjectKind[];
  name: string;
  blurb: string;
  requires: ToolId[];
  steps: TemplateStep[];
  seeds: TemplateSeed[];
  /** Where to get the missing toolchain, shown when preflight fails. */
  docs: string;
}

export interface KindSpec {
  id: ProjectKind;
  name: string;
  blurb: string;
}

export interface TemplateOptions {
  /** Run the template's `install` steps. */
  install: boolean;
  /** `git init` in the finished folder, unless the template made a repo. */
  git: boolean;
  /** Open a terminal in the project once it is built. */
  openTerminal: boolean;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  install: true,
  git: true,
  openTerminal: true,
};
