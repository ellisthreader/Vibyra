import test from 'node:test';
test('Linux root supervisor stops clean and stubborn UID1001 writers before snapshot', async () => { await import('./linux-uid-stop-proof.mjs'); });
