const kind = process.argv[1], program = process.argv[2];
const provider = kind === 'claude' ? new ClaudeProvider(program) : new GeminiProvider(program);
async function dispatch(value) {
  if (!value.method) { provider.resolve(value); return; }
  if (value.id == null) return;
  try {
    let result;
    switch (value.method) {
      case 'initialize': result = await provider.initialize(); break;
      case 'thread/start': result = await provider.start(value.params); break;
      case 'turn/start': result = await provider.prompt(value.params); break;
      case 'turn/interrupt': result = await provider.interrupt(); break;
      case 'model/list': result = { data: provider.models, nextCursor: null }; break;
      case 'account/rateLimits/read': throw new Error(`${kind === 'claude' ? 'Claude' : 'Gemini'} does not expose account quota windows through this connection`);
      default: throw new Error('Unsupported provider operation');
    }
    output({ id: value.id, result });
  } catch (error) { output({ id: value.id, error: { code: -32000, message: String(error.message ?? error) } }); }
}
lines(process.stdin, value => void dispatch(value), () => { provider.wire.child.kill(); process.exit(1); });
process.stdin.on('end', () => { provider.wire.child.kill(); process.exit(); });
