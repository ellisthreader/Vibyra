import { useEffect, useState } from 'react';
import { readWelcome, writeWelcome } from './preference';

export function useWelcome() {
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void readWelcome().then(value => { if (active) setComplete(value === '1'); })
      .catch(() => { /* Unavailable storage must not prevent first-run setup. */ })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const finish = async () => {
    try { await writeWelcome(); setError(null); }
    catch { setError('Your browser or device could not save setup. You may see the welcome screen next time.'); }
    setComplete(true);
  };
  return { ready, complete, error, finish, reopen: () => setComplete(false) };
}
