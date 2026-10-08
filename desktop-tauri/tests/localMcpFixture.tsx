import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { useState } from 'react';
import { LocalMcpBlock } from '../src/components/settings/LocalMcpBlock';
import { useAccountStore } from '../src/state/accountStore';
import type { LocalSpec, LocalView } from '../src/lib/localMcp';
import type { McpServer, McpTool } from '../../mobile/src/agents/v2/connectionsModel';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/settings-shell.css';
import '../src/styles/modals.part-02.css';

/** Settings > Local MCP servers against an in-memory Mac and account. Nothing here starts a process. */
const params = new URLSearchParams(location.search);
if (params.has('light')) document.documentElement.dataset.theme = 'light';
useAccountStore.setState({ snapshot: { status: 'signedIn', profile: { email: 'local-mcp@example.test' }, secureStorage: true } as any });
const calls: any[] = [];
let views: LocalView[] = [], servers: Record<string, McpServer> = {}, refresh = () => {}, n = 0;
const enabledForAccount = !params.has('off');
const tool = (slug: string, name: string, description: string, readOnlyHint: boolean, kind: 'read' | 'write' = 'write'): McpTool =>
  ({ tool: `${slug}__${name}`, remoteName: name, description, kind, readOnlyHint, destructiveHint: !readOnlyHint });
const status = (state: LocalView['status']['state'], lastError: string | null = null) =>
  ({ state, lastError, era: state === 'running' ? 'legacy' : null, protocolVersion: state === 'running' ? '2025-11-25' : null, failures: lastError ? 5 : 0, startedAtMs: null } as LocalView['status']);
const unpinned = (s: LocalSpec) => ['npx', 'uvx'].includes(s.command) && !s.args.some(a => /@\d|==\d/.test(a));
const set = (next: LocalView[]) => { views = next; refresh(); };
if (params.has('seed')) {
  const spec: LocalSpec = { id: 'seed-files-0001', name: 'Project files', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '/Users/you/Projects/site'],
    cwd: '/Users/you/Projects/site', env: {}, secretEnv: [], enabled: true, timeoutSecs: null, connectionId: 'c0000000-0000-4000-8000-000000000001', preset: 'filesystem' };
  views = [{ spec, status: status('running'), unpinned: false, secretsSaved: [] },
    { spec: { ...spec, id: 'seed-db-00000002', name: 'Notes database', command: 'uvx', args: ['mcp-server-sqlite==2025.4.25', '--db-path', '/Users/you/notes.db'], connectionId: 'c0000000-0000-4000-8000-000000000002', preset: 'sqlite', enabled: false },
      status: status('stopped'), unpinned: false, secretsSaved: [] },
    { spec: { ...spec, id: 'seed-bad-00000003', name: 'Broken server', command: 'my-server', args: [], connectionId: null, preset: null }, status: status('failed', 'The server stopped 5 times in a row. Fix it, then retry from Settings.'), unpinned: false, secretsSaved: [] }];
  servers['c0000000-0000-4000-8000-000000000001'] = { kind: 'local', localId: 'seed-files-0001', hostId: 'h', connectionId: 'c0000000-0000-4000-8000-000000000001', provider: 'lmcp_0a1b2c3d', url: '', name: 'Project files',
    auth: null, status: 'active', protocolVersion: null, toolRevision: 'a'.repeat(64), pending: null,
    tools: [tool('lmcp_0a1b2c3d', 'read_text_file', 'Read a file as text', true, 'read'), tool('lmcp_0a1b2c3d', 'list_directory', 'List a folder', true), tool('lmcp_0a1b2c3d', 'write_file', 'Create or overwrite a file', false)] };
}
mockIPC((cmd, args: any) => {
  calls.push({ cmd, ...args });
  switch (cmd) {
    case 'local_mcp_list': return structuredClone(views);
    case 'local_mcp_check': return { problem: args.spec.command.trim() ? null : 'Give the command that starts the server.', unpinned: unpinned(args.spec) };
    case 'local_mcp_pick': return args.kind === 'folder' ? '/Users/you/Projects/site' : '/Users/you/data/app.db';
    case 'local_mcp_save': {
      const spec: LocalSpec = { ...args.spec, id: args.spec.id || `new-${++n}-000000` };
      const old = views.find(v => v.spec.id === spec.id);
      const view: LocalView = { spec: { ...spec, connectionId: old?.spec.connectionId ?? null }, status: status('stopped'), unpinned: unpinned(spec), secretsSaved: spec.secretEnv.filter(k => args.secrets[k] || old?.secretsSaved.includes(k)) };
      set(old ? views.map(v => (v.spec.id === spec.id ? view : v)) : [...views, view]);
      return view;
    }
    case 'local_mcp_connect': {
      const v = views.find(x => x.spec.id === args.id)!, id = `c0000000-0000-4000-8000-00000000000${views.indexOf(v) + 5}`;
      servers[id] = { kind: 'local', localId: v.spec.id, hostId: 'h', connectionId: id, provider: 'lmcp_deadbeef', url: '', name: v.spec.name, auth: null, status: 'active', protocolVersion: null, toolRevision: 'a'.repeat(64), pending: null,
        tools: [tool('lmcp_deadbeef', 'read_text_file', 'Read a file as text', true), tool('lmcp_deadbeef', 'write_file', 'Create or overwrite a file', false)] };
      set(views.map(x => (x === v ? { ...x, spec: { ...x.spec, connectionId: id }, status: status('running') } : x)));
      return servers[id];
    }
    case 'local_mcp_set_enabled': set(views.map(v => (v.spec.id === args.id ? { ...v, spec: { ...v.spec, enabled: args.enabled } } : v))); return views.find(v => v.spec.id === args.id);
    case 'local_mcp_retry': set(views.map(v => (v.spec.id === args.id ? { ...v, status: status('stopped') } : v))); return views.find(v => v.spec.id === args.id);
    case 'local_mcp_remove': set(views.filter(v => v.spec.id !== args.id)); return null;
    case 'teammate_request': if (args.path === 'agents/v2/local-mcp') return { enabled: enabledForAccount, servers: [] }; throw `Unsupported fixture request: ${args.path}`;
  }
  throw `Unsupported command ${cmd}`;
});
const put = (s: McpServer) => { servers = { ...servers, [s.connectionId]: s }; refresh(); };
const asKind = (s: McpServer, reads: string[]): McpServer => ({ ...s, tools: s.tools.map(t => ({ ...t, kind: reads.includes(t.tool) ? 'read' : 'write' })) });
(window as any).fixture = { calls, changeTools() { const [id, s] = Object.entries(servers)[0]!; put({ ...s, status: 'tools_changed', pending: { revision: 'b'.repeat(64), added: [`${s.provider}__delete_all`], removed: [], changed: [s.tools[2]!.tool],
  tools: [...s.tools, tool(s.provider, 'delete_all', 'Delete everything', false)] } }); return id; } };
function Fixture() {
  const [, bump] = useState(0);
  refresh = () => bump(x => x + 1);
  const hub: any = { servers, busy: null, error: '', connections: [], catalogue: [], refresh: async () => refresh(), cancel() {},
    mcpApprove: async (s: McpServer) => { calls.push({ cmd: 'approve', revision: s.pending!.revision }); put({ ...s, status: 'active', pending: null, tools: s.pending!.tools }); },
    mcpReads: async (id: string, tools: string[]) => { calls.push({ cmd: 'reads', tools }); put(asKind(servers[id]!, tools)); },
    mcpRefresh: async (id: string) => { calls.push({ cmd: 'refresh', id }); } };
  return <div className="settings-pane" style={{ padding: '16px 32px', maxWidth: 820 }}><LocalMcpBlock hub={hub} /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
