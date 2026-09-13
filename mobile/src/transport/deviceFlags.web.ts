// Browser preview: non-secret flags may survive a reload in localStorage. Secrets never go here.
const prefix = 'vibyra.remote.v1.flag.';
export const readFlag = async (key: string) => localStorage.getItem(prefix + key);
export const writeFlag = async (key: string, value: string) => { localStorage.setItem(prefix + key, value); };
export const deleteFlag = async (key: string) => { localStorage.removeItem(prefix + key); };
