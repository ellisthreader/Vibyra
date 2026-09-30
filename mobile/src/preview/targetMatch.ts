interface ProjectPath {
  id: string;
  path: string;
}
interface PreviewTargetScope {
  projectId: string;
}
interface PreviewTargetState {
  targetId: string;
  running?: boolean;
}

/** Old Macs omit `running`; their auto-discovered targets are live by definition.
 * A manual port can stay listed after its server stops, so it needs the signal. */
export function previewTargetRunning(target: PreviewTargetState): boolean {
  return (
    target.running === true || (target.running == null && target.targetId.startsWith('auto-port:'))
  );
}

/** Desktop project IDs and shared-chat project IDs can name the same Mac
 * folder. This only decides where an already-approved target appears in the
 * phone UI; the Mac still authorizes every Preview request by grant ID. */
export function previewTargetMatchesProject(
  target: PreviewTargetScope,
  projectId: string,
  projects: readonly ProjectPath[],
): boolean {
  if (target.projectId === projectId) return true;
  const selected = projects.find((project) => project.id === projectId)?.path;
  const approved = projects.find((project) => project.id === target.projectId)?.path;
  if (!selected || !approved) return false;
  if (selected === approved) return true;
  const sameAbbreviatedHome = (short: string, absolute: string) =>
    short.startsWith('~/') && absolute.startsWith('/') && absolute.endsWith(short.slice(1));
  return sameAbbreviatedHome(selected, approved) || sameAbbreviatedHome(approved, selected);
}
