// Loopback-only fixture for inspecting the actual production portal bundle; no credentials or live writes.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function html() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/build/manifest.json'), 'utf8'));
  const entry = manifest['resources/js/portal.jsx'];
  const styles = [...new Set([manifest['resources/css/portal.css'].file, ...(entry.css || [])])]
    .map(file => `<link rel="stylesheet" href="/build/${file}">`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Team QA</title>${styles}<body><div id="portal-root"></div><script type="module" src="/build/${entry.file}"></script></body></html>`;
}
const fixture = {
  ok: true, role: 'owner', can: ['invite', 'invite_admin', 'remove', 'change_role', 'rename', 'transfer'],
  team: { id: 'qa-team', name: 'Northstar Studio', seatsUsed: 3, seats: 12, defaultMonthCapTokens: null },
  you: { memberId: 1, monthCapCeilingTokens: null },
  members: [
    { id: 1, name: 'Alex Owner', email: 'owner@example.test', role: 'owner', you: true },
    { id: 2, name: 'Sam Manager', email: 'manager@example.test', role: 'admin', you: false },
    { id: 3, name: 'Taylor Member', email: 'member@example.test', role: 'member', you: false },
  ],
  invitations: [{ id: 'qa-invite', email: 'new@example.test', role: 'admin', expiresAt: '2026-10-17T10:00:00Z' }],
  sso: { visible: true, configured: false, hasSecret: false, redirectUri: 'https://vibyra.net/auth/sso/callback', domainVerified: false },
};
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname.startsWith('/web-api/') || url.pathname.startsWith('/api/')) {
    let chunks = ''; for await (const c of req) chunks += c;
    let body = {}; try { body = JSON.parse(chunks || '{}'); } catch { /* invalid fixture input */ }
    let data = { ok: true };
    if (url.pathname === '/web-api/session') data.user = { id: 1, name: 'Alex Owner', email: 'owner@example.test' };
    else if (url.pathname === '/web-api/team') {
      if (req.method === 'PATCH') fixture.team.name = String(body.name || fixture.team.name);
      data = fixture;
    } else if (url.pathname === '/web-api/team/invitations') {
      fixture.invitations.push({ id: String(Date.now()), email: body.email, role: body.role, expiresAt: '2026-10-17T10:00:00Z' });
      data = fixture;
    } else if (url.pathname === '/web-api/team/invitations/preview') data = { ok: true, team: fixture.team.name, role: 'admin' };
    else if (url.pathname === '/web-api/auth/sso') data.enabled = true;
    else if (url.pathname.startsWith('/web-api/team/')) data = fixture;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return;
  }
  if (url.pathname.startsWith('/build/') || url.pathname.startsWith('/fonts/') || url.pathname === '/vibyra-cobalt.png') {
    const file = resolve(root, 'public', '.' + url.pathname);
    if (!file.startsWith(resolve(root, 'public') + '/')) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
    return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end(html());
}).listen(43137, '127.0.0.1', () => console.log('Local fixture: http://127.0.0.1:43137/account/team'));
