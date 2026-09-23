import { useProjectStore } from "../state/projectStore";
import { allTerminals } from "./vibyraSessions";
import { fail, projects, resolveProject, text, type ToolResult } from "./vibyraToolShared";

// Projects, through the project row's own actions: open one, add a folder,
// rename it in the list, drop it from the list. None of these touches the
// folder on disk — removing a project only forgets it.

export function listProjects(): ToolResult {
  const all = projects();
  if (!all.length) return { summary: "Checked the projects", detail: "No projects have been added yet." };
  const { activeId, view } = useProjectStore.getState();
  const terminals = allTerminals();
  return {
    summary: `Checked ${all.length} project${all.length === 1 ? "" : "s"}`,
    detail: all
      .map((project) => {
        const open = terminals.filter((terminal) => terminal.projectId === project.id).length;
        const here = project.id === activeId && view === "project" ? " — open now" : "";
        return `${project.name} at ${project.root} · ${open} terminal${open === 1 ? "" : "s"}${here}`;
      })
      .join("\n"),
  };
}

export async function switchProject(args: Record<string, unknown>): Promise<ToolResult> {
  const wanted = text(args.project);
  const project = wanted ? resolveProject(wanted) : null;
  if (!project) return fail(`There is no project called "${wanted}". Projects: ${projects().map((entry) => entry.name).join(", ")}.`);
  await useProjectStore.getState().activate(project.id);
  return { summary: `Opened ${project.name}`, detail: `${project.name} is now the open project.` };
}

/** An existing folder becomes a project. `~` is the person's home, as it is
 * in every terminal they have. */
export async function addProject(args: Record<string, unknown>): Promise<ToolResult> {
  const said = text(args.path);
  if (!said) return fail("Say which folder to add.");
  const home = useProjectStore.getState().homeDir.replace(/\/+$/, "");
  const path = said.replace(/^~(?=\/|$)/, home);
  if (!path.startsWith("/")) return fail(`"${said}" is not a full folder path. Give one starting with / or ~.`);
  const project = await useProjectStore.getState().create(path, text(args.name) || undefined);
  if (!project) return fail(`"${said}" could not be added.`);
  return { summary: `Added ${project.name}`, detail: `Added ${project.name} at ${project.root} and opened it.` };
}

export async function renameProject(args: Record<string, unknown>): Promise<ToolResult> {
  const project = resolveProject(text(args.project));
  if (!project) return fail(`There is no project called "${text(args.project)}".`);
  const name = text(args.name);
  if (!name) return fail("Say what to call it.");
  const renamed = await useProjectStore.getState().rename(project.id, name);
  if (!renamed) return fail(`${project.name} could not be renamed.`);
  return { summary: `Renamed ${project.name} to ${renamed.name}`, detail: `${project.name} is now called ${renamed.name}. Its folder is unchanged.` };
}

export async function removeProject(args: Record<string, unknown>): Promise<ToolResult> {
  const wanted = text(args.project);
  const project = wanted ? resolveProject(wanted) : null;
  if (!project) return fail(`There is no project called "${wanted}".`);
  const closing = allTerminals().filter((terminal) => terminal.projectId === project.id).length;
  await useProjectStore.getState().remove(project.id);
  return {
    summary: `Removed ${project.name} from Vibyra`,
    detail: `${project.name} is no longer in Vibyra's list${closing ? ` and its ${closing} terminal${closing === 1 ? " was" : "s were"} closed` : ""}. The folder ${project.root} was not touched.`,
  };
}
