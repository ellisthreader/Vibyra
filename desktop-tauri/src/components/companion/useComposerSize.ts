import { useLayoutEffect, useRef } from 'react';

/** Pasted, restored and voice-written drafts all get the same measured height. */
export function useComposerSize(value: string, active: boolean) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const measure = () => {
    const field = ref.current;
    if (!field || !field.clientWidth) return;
    field.style.height = '0px';
    field.style.height = `${Math.min(144, Math.max(48, field.scrollHeight))}px`;
  };
  useLayoutEffect(measure, [value, active]);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) { width = field.clientWidth; measure(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);
  return ref;
}
