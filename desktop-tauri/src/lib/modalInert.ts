// Each modal releases only its own hold, including pre-existing inert state.
const holds = new Map<HTMLElement, { count: number; original: boolean }>();
export function holdInert(element: HTMLElement): () => void {
  const hold = holds.get(element) ?? { count: 0, original: element.hasAttribute("inert") };
  hold.count++;
  holds.set(element, hold);
  element.setAttribute("inert", "");
  return () => {
    if (--hold.count > 0) return;
    if (!hold.original) element.removeAttribute("inert");
    holds.delete(element);
  };
}
export const modalStack: HTMLElement[] = [];
