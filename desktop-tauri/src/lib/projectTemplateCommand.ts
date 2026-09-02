import { pascalCase, parentOf, slugify } from "./projectDestination.ts";
import type { ProjectTemplate, TemplateOptions } from "./projectTemplateTypes";

// Turns one pick plus the option toggles into the exact work Rust will do.
// Pure, so the review step can show the literal commands and a test can assert
// them without spawning anything.

export interface ScaffoldStepRequest {
  label: string;
  program: string;
  args: string[];
  /** Absolute. `parent` steps run beside the folder, `project` steps inside. */
  cwd: string;
}

export interface ScaffoldSeedRequest {
  path: string;
  body: string;
}

export interface ScaffoldRequest {
  dir: string;
  /** Created before any step; false when the scaffolder makes the folder. */
  createDir: boolean;
  seeds: ScaffoldSeedRequest[];
  steps: ScaffoldStepRequest[];
  gitInit: boolean;
}

function fill(value: string, slug: string): string {
  return value.split("{{name}}").join(slug).split("{{Name}}").join(pascalCase(slug));
}

export function buildScaffoldRequest(
  entry: ProjectTemplate,
  dir: string,
  options: TemplateOptions,
): ScaffoldRequest {
  const slug = slugify(dir.split(/[\\/]/).filter(Boolean).pop() ?? "");
  const parent = parentOf(dir);
  const wanted = entry.steps.filter((step) => step.phase === "create" || options.install);
  const steps = wanted.map((step) => ({
    label: step.label,
    program: fill(step.program, slug),
    args: step.args.map((arg) => fill(arg, slug)),
    cwd: step.cwd === "parent" ? parent : dir,
  }));
  // A scaffolder that makes its own folder must not find one already there:
  // some refuse outright, and the ones that do not still expect to own it.
  const createDir = !entry.steps.some((step) => step.cwd === "parent");
  return {
    dir,
    createDir,
    seeds: entry.seeds.map((seed) => ({ path: seed.path, body: fill(seed.body, slug) })),
    steps,
    gitInit: options.git,
  };
}

/** The commands as the review step shows them — one line each, quoted the way
 * a shell would need, though nothing is ever run through a shell. */
export function describeSteps(request: ScaffoldRequest): string[] {
  return request.steps.map((step) =>
    [step.program, ...step.args]
      .map((token) => (/[\s"']/.test(token) ? JSON.stringify(token) : token))
      .join(" "),
  );
}
