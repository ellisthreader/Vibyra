import { useEffect, useRef, useState } from "react";

export function useEditorSave() {
  const mounted = useRef(true);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run<T>(save: () => Promise<T>, success?: (result: T) => void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await save();
      if (mounted.current) success?.(result);
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, run };
}
