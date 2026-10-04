import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

// An actual modern-only SDK endpoint for the Rust client's opt-in acceptance test.
serveStdio(() => {
  const server = new McpServer({ name: 'vibyra-stdio-acceptance', version: '1.0.0' });
  server.registerTool('hello', { description: 'Return a fixed acceptance receipt', annotations: { readOnlyHint: true } },
    async () => ({ content: [{ type: 'text', text: 'official-sdk-modern-ok' }] }));
  return server;
}, { legacy: 'reject' });
