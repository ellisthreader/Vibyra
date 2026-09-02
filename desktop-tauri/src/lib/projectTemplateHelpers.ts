import type {
  ProjectKind,
  ProjectTemplate,
  StepCwd,
  TemplateSeed,
  TemplateStep,
  ToolId,
} from "./projectTemplateTypes";

// Small constructors so a catalog entry reads as one line per idea. `create`
// steps always run; `install` steps are the ones the dependencies toggle
// turns off, so a template only marks a step `install` when the project still
// makes sense without it.

export function create(
  label: string,
  program: string,
  args: string[],
  cwd: StepCwd = "parent",
): TemplateStep {
  return { label, program, args, cwd, phase: "create" };
}

export function install(label: string, program: string, args: string[]): TemplateStep {
  return { label, program, args, cwd: "project", phase: "install" };
}

interface TemplateSpec {
  id: string;
  kinds: ProjectKind[];
  name: string;
  blurb: string;
  requires?: ToolId[];
  steps?: TemplateStep[];
  seeds?: TemplateSeed[];
  docs?: string;
}

export function template(spec: TemplateSpec): ProjectTemplate {
  return {
    id: spec.id,
    kinds: spec.kinds,
    name: spec.name,
    blurb: spec.blurb,
    requires: spec.requires ?? [],
    steps: spec.steps ?? [],
    seeds: spec.seeds ?? [],
    docs: spec.docs ?? "",
  };
}

export const NODE_DOCS = "https://nodejs.org/en/download";
export const NPM_INSTALL = install("Installing packages", "npm", ["install"]);
