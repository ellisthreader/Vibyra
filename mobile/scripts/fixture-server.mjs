import { build } from 'esbuild';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

// Bundles one fixture and serves it, so each verification script is a list of
// assertions rather than a copy of the same esbuild and http setup.
export async function serveFixture(entry) {
  const bundle = await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
    entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: { 'react-native': 'react-native-web' },
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true', global: 'globalThis' },
    loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl' },
    plugins: [{ name: 'fixture-shims', setup(b) {
      b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async-hooks', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class AsyncLocalStorage { getStore() { return undefined; } }' }));
    } }],
  });
  const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>html,body,#root{margin:0;height:100%;width:100%;overflow:hidden}#root{display:flex}</style>'
    + '<div id="root"></div><script src="/fixture.js"></script>';
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
