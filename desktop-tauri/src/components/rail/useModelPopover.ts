import { useLayoutEffect, useState, type RefObject } from 'react';

/** Portal geometry is viewport-relative, independent of launcher scroll clipping. */
export function useModelPopover(anchor: RefObject<HTMLElement | null>, close: () => void) {
  const [style, setStyle] = useState({ left: 0, top: 0, width: 400, maxHeight: 400 });
  useLayoutEffect(() => {
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(540, rect.width, innerWidth - 24);
      const height = Math.min(410, innerHeight - 32);
      // Prefer below the tiles; in short windows float upward over the card.
      const top = Math.max(16, Math.min(rect.bottom + 8, innerHeight - height - 16));
      setStyle({ left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), top, width, maxHeight: height });
    };
    position();
    window.addEventListener('resize', position);
    const scroll = (event: Event) => { if (!(event.target as Element)?.closest?.('.launch-model-browser')) position(); };
    window.addEventListener('scroll', scroll, true);
    const observer = new ResizeObserver(position);
    if (anchor.current) observer.observe(anchor.current);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', scroll, true); observer.disconnect(); };
  }, [anchor]);
  useLayoutEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest('.launch-model-browser') && !anchor.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [anchor, close]);
  return style;
}
