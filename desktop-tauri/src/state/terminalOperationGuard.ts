const active = new Set<number>();

/** Prevents double-clicks from launching two replacement PTYs for one pane. */
export async function runTerminalOperation(
  id: number,
  operation: () => Promise<void>,
): Promise<void> {
  if (active.has(id)) return;
  active.add(id);
  try {
    await operation();
  } finally {
    active.delete(id);
  }
}
