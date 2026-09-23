import { useEffect, useRef, useState } from 'react';
export function useCompactLayout() {
  const ref = useRef<HTMLDivElement>(null), [compact, setCompact] = useState(false);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width <= 700));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  return { ref, compact };
}
