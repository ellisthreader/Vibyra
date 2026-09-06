// Only the non-sensitive welcome preference is durable in a browser. Never store pairing keys here.
const key = 'vibyra.remote.welcome.v1';
export const readWelcome = async () => localStorage.getItem(key);
export const writeWelcome = async () => { localStorage.setItem(key, '1'); };
