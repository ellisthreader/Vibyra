import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Optional, immutable reference extracted from an installed Tauri application.
// It is review data only and is never copied into a release frontend.
export async function referenceAssets(directory) {
  if (!directory) return null;
  const root = resolve(directory);
  const source = await readFile(resolve(root, 'index.html'), 'utf8');
  const entry = source.match(/<script[^>]+src="([^"]+)"/)?.[1];
  const styles = [...source.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1]);
  if (!entry || !styles.length) throw new Error('Installed reference has no entry or styles.');
  const files = await readdir(resolve(root, 'assets'));
  const stores = files.filter(file => /^(projectStore|workspaceStore|conversationTerminalStore|modelCatalogStore)-.*\.js$/.test(file));
  const manifest = { entry: '/reference' + entry, stores: stores.map(file => '/reference/assets/' + file) };
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webm': 'video/webm' };
  return {
    styles: styles.map(file => `<link rel="stylesheet" href="/reference${file}">`).join(''),
    async serve(req, res) {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/reference-manifest') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(manifest)); return true;
      }
      if (!url.pathname.startsWith('/reference/') && !url.pathname.startsWith('/assets/')) return false;
      const relative = url.pathname.replace(/^\/reference\//, '').replace(/^\//, '');
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep)) { res.statusCode = 403; res.end(); return true; }
      try {
        const bytes = await readFile(file);
        res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        res.end(bytes); return true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return false;
      }
    },
  };
}
