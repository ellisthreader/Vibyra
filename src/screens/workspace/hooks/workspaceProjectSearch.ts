type SearchableProject = {
  name?: unknown;
  path?: unknown;
  stack?: unknown;
};

export function projectMatchesSearch(project: SearchableProject, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;

  return [project.name, project.path, project.stack].some(
    (value) => typeof value === "string" && value.toLowerCase().includes(normalizedSearch)
  );
}
