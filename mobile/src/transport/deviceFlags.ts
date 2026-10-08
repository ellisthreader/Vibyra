// Non-secret device flags (for example "welcome flow completed"). Native keeps them in the same
// Keychain-backed store as trust keys so nothing new has to be provisioned; see deviceFlags.web.ts.
import { deleteSecure, readSecure, writeSecure } from './secureStorage';

export const readFlag = (key: string) => readSecure(`flag.${key}`);
export const writeFlag = (key: string, value: string) => writeSecure(`flag.${key}`, value);
export const deleteFlag = (key: string) => deleteSecure(`flag.${key}`);
