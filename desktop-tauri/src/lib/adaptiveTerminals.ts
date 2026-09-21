export interface LayoutSession { key: string; shell: boolean }
/** Focus never changes order, size or runtime identity. Only explicit expansion hides peers. */
export function adaptiveTerminals(items: LayoutSession[], zoomed: string | null) {
  const agents = items.filter(item => !item.shell);
  const shells = items.filter(item => item.shell);
  return { agents, shells, max: items.find(item => item.key === zoomed)?.key,
    onlyShells: agents.length === 0 };
}
