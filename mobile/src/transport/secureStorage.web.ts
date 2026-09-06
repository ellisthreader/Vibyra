// Browser preview intentionally keeps trust keys in memory. Native uses iOS Keychain.
const memory = new Map<string, string>();
export const readSecure = async (key: string) => memory.get(key) ?? null;
export const writeSecure = async (key: string, value: string) => { memory.set(key, value); };
export const deleteSecure = async (key: string) => { memory.delete(key); };
