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

/** The address a developer knows the site by, `localhost:5173`, when its port is known. */
export function previewAddress(target: PreviewTargetState): string | null {
  const port = /^(?:auto|attached)-port:(\d{1,5})$/.exec(target.targetId)?.[1];
  return port ? `localhost:${port}` : null;
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
  if (!projectId || !target.projectId) return false;
  if (target.projectId === projectId) return true;
  const selected = projects.find((project) => project.id === projectId)?.path;
  const approved = projects.find((project) => project.id === target.projectId)?.path;
  if (!selected || !approved) return false;
  if (selected === approved) return true;
  // Only expand the Mac home prefix, never an arbitrary matching path suffix
  // (e.g. /Volumes/Backup/Desktop/Site is not ~/Desktop/Site).
  const sameAbbreviatedHome = (short: string, absolute: string) => {
    const homeRelative = /^\/Users\/[^/]+(\/.*)$/.exec(absolute)?.[1];
    return short.startsWith('~/') && homeRelative === short.slice(1);
  };
  return sameAbbreviatedHome(selected, approved) || sameAbbreviatedHome(approved, selected);
}
