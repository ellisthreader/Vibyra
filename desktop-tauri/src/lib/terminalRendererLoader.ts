export type RendererAddonConstructor<T> = new () => T;

/**
 * Waits for the renderer decision before attaching an addon, and guarantees
 * one attachment per terminal even when startup and remount paths overlap.
 */
export function createRendererLoader<Terminal extends object, Addon>(
  ready: () => Promise<RendererAddonConstructor<Addon> | null>,
  load: (terminal: Terminal, addon: Addon) => void,
  canLoad: (terminal: Terminal) => boolean = () => true,
): (terminal: Terminal) => Promise<Addon | null> {
  const pending = new WeakMap<Terminal, Promise<Addon | null>>();

  return (terminal) => {
    const existing = pending.get(terminal);
    if (existing) return existing;

    const attachment = ready().then((AddonConstructor) => {
      if (!AddonConstructor || !canLoad(terminal)) return null;
      const addon = new AddonConstructor();
      load(terminal, addon);
      return addon;
    });
    pending.set(terminal, attachment);
    void attachment.then(
      (addon) => {
        if (!addon && pending.get(terminal) === attachment) pending.delete(terminal);
      },
      () => {
        if (pending.get(terminal) === attachment) pending.delete(terminal);
      },
    );
    return attachment;
  };
}
