import { readSecure, writeSecure } from '../transport/secureStorage';

export const readWelcome = () => readSecure('welcome-complete');
export const writeWelcome = () => writeSecure('welcome-complete', '1');
