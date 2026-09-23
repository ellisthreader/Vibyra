import { projectBrief } from "../ipc/projectBrief";
import { CONTEXT_OFF, systemPrompt } from "../lib/chatPrompt";
import { useSettingsStore } from "./settingsStore";

/** The brief costs a native call, so the placeholder is already on screen by
 * the time this is awaited. A brief that cannot be read is not faked. */
export async function buildPrompt(projectId: string, query: string, spoken: boolean): Promise<string> {
  const settings = useSettingsStore.getState().settings;
  const project = settings?.projects.find((p) => p.id === projectId) ?? null;
  if (!project) return systemPrompt(null, null, spoken);
  const brief =
    settings?.sendProjectContext === false
      ? CONTEXT_OFF
      : await projectBrief(project, query).catch(() => null);
  return systemPrompt(brief, project, spoken);
}
