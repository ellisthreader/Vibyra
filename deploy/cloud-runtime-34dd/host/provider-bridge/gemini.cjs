// Agent Client Protocol (JSON-RPC over stdio), for any ACP-speaking CLI. Gemini is the built-in one; a custom agent
// (kind "acp") passes its own arguments and display name in VIBYRA_ACP_ARGS / VIBYRA_ACP_NAME. Permission requests
// become the same `vibyra/tool/requestApproval` the Host already shows in Vibyra's approval UI; nothing is auto-approved.
class AcpProvider {
  constructor(program, args, label) {
    this.label = label; this.turn = null; this.tools = new Map(); this.permissions = new Map();
    this.wire = new ProviderWire(program, args, value => this.receive(value), { skipInvalid: true });
  }
  rpc(method, params) { const id = randomUUID(); return this.wire.request({ jsonrpc: '2.0', id, method, params }, id); }
  async initialize() {
    this.capabilities = await this.rpc('initialize', { protocolVersion: 1, clientInfo: { name: 'Vibyra', version: '0.7.5' }, clientCapabilities: {} });
    if (this.capabilities?.protocolVersion !== 1) throw new Error(`${this.label} does not speak Agent Client Protocol version 1`);
    return {};
  }
  async start(params) {
    if (params.approvalPolicy === 'never') throw new Error(`${this.label} structured sessions require normal tool approvals. Choose Standard access.`);
    const session = await this.rpc('session/new', { cwd: process.cwd(), mcpServers: [] });
    this.thread = session.sessionId;
    // ACP models are optional: an agent that lists none runs on its own model, shown as one "default" choice.
    this.chooser = (session.models?.availableModels ?? []).length > 0;
    this.models = (this.chooser ? session.models.availableModels : [{ modelId: 'default', name: this.label }]).map(model => ({ model: model.modelId, displayName: model.name, defaultReasoningEffort: 'none', supportedReasoningEfforts: [{ reasoningEffort: 'none', description: `Managed by ${this.label}` }] }));
    this.model = params.model ?? session.models?.currentModelId ?? 'default';
    if (!this.models.some(model => model.model === this.model)) throw new Error(`This ${this.label} session did not advertise the selected model`);
    if (this.chooser && params.model && params.model !== session.models?.currentModelId) await this.rpc('session/set_model', { sessionId: this.thread, modelId: this.model });
    return { thread: { id: this.thread }, model: this.model, reasoningEffort: 'none', approvalPolicy: 'on-request', sandbox: { type: 'providerManaged' } };
  }
  async prompt(params) {
    if (this.turn) throw new Error(`A ${this.label} turn is already active`);
    if (params.model !== this.model) {
      if (this.chooser) await this.rpc('session/set_model', { sessionId: this.thread, modelId: params.model });
      this.model = params.model;
    }
    const prompt = params.input.map(input => input.type === 'text' ? { type: 'text', text: input.text }
      : input.type === 'image' && input.url?.startsWith('data:') ? { type: 'image', mimeType: input.url.split(';')[0].slice(5), data: input.url.split(',')[1] } : null);
    if (prompt.some(input => !input)) throw new Error(`This attachment type is unavailable for ${this.label}`);
    const id = this.turn = randomUUID(); this.messageId = null;
    event('turn/started', { threadId: this.thread, turn: { id } });
    // Prompt resolves at completion, unlike the immediate Host submission receipt.
    const requestId = randomUUID();
    this.wire.pending.set(requestId, { resolve: result => this.complete(id, result.stopReason === 'cancelled' ? 'interrupted' : 'completed'), reject: error => this.complete(id, 'failed', error.message) });

    this.wire.write({ jsonrpc: '2.0', id: requestId, method: 'session/prompt', params: { sessionId: this.thread, prompt } });
    return { turn: { id } };
  }
  complete(id, status, message) {
    event('turn/completed', { threadId: this.thread, turn: { id, status, error: message ? { message } : null } });
    this.turn = null; this.permissions.clear(); this.tools.clear();
  }
  async interrupt() { this.wire.write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.thread } }); return {}; }
  resolve(value) {
    const permission = this.permissions.get(value.id); if (!permission) return;
    const approved = !value.error && value.result?.decision === 'accept';
    const option = permission.options.find(option => option.kind === (approved ? 'allow_once' : 'reject_once'));
    this.wire.write({ jsonrpc: '2.0', id: value.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
    permission.answered = true;
    // A declined tool may never report completion; release the request now so it cannot hold later ones.
    if (!approved) { event('serverRequest/resolved', { threadId: this.thread, requestId: value.id }); this.permissions.delete(value.id); }
  }
  receive(value) {
    if (!value.method) { this.wire.reply(value.id, value.result, value.error?.message); return; }
    if (value.id != null) {
      if (value.method !== 'session/request_permission' || !this.turn) { this.wire.write({ jsonrpc: '2.0', id: value.id, error: { code: -32601, message: 'Unsupported client operation' } }); return; }
      const p = value.params, call = p.toolCall ?? {}, title = String(call.title ?? 'use a tool');
      this.permissions.set(value.id, { ...p, toolCall: { ...call, toolCallId: call.toolCallId ?? String(value.id) }, options: p.options ?? [], answered: false });
      output({ id: value.id, method: 'vibyra/tool/requestApproval', params: { threadId: this.thread, turnId: this.turn,
        itemId: call.toolCallId ?? String(value.id), tool: title, input: call.rawInput ?? call.content ?? {}, reason: `${this.label} wants to: ${title}`, cwd: process.cwd(), availableDecisions: ['accept', 'decline'] } }); return;
    }
    if (value.method !== 'session/update' || value.params.sessionId !== this.thread || !this.turn) return;
    const update = value.params.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      if (!this.messageId) { this.messageId = randomUUID(); event('item/started', { threadId: this.thread, turnId: this.turn, item: { type: 'agentMessage', id: this.messageId, text: '' } }); }
      event('item/agentMessage/delta', { threadId: this.thread, turnId: this.turn, itemId: this.messageId, delta: update.content.text });
    }
    // Thought chunks are intentionally excluded; they are not public summaries.
    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      this.messageId = null;
      const tool = { ...this.tools.get(update.toolCallId), ...update }; this.tools.set(update.toolCallId, tool);
      const completed = tool.status === 'completed' || tool.status === 'failed';
      event(completed ? 'item/completed' : 'item/started', { threadId: this.thread, turnId: this.turn, item: geminiTool(tool, process.cwd()) });
      if (completed) for (const [id, permission] of this.permissions) if (permission.toolCall.toolCallId === tool.toolCallId && permission.answered) {
        event('serverRequest/resolved', { threadId: this.thread, requestId: id }); this.permissions.delete(id);
      }
    }
  }
}
class GeminiProvider extends AcpProvider { constructor(program) { super(program, ['--acp'], 'Gemini'); } }
/** A custom agent's ACP arguments and display name, from the environment the Host launched the bridge with. */
function acpAgent(program) {
  let args = [];
  try { args = JSON.parse(process.env.VIBYRA_ACP_ARGS || '[]'); } catch { throw new Error('VIBYRA_ACP_ARGS must be a JSON array of strings'); }
  if (!Array.isArray(args) || args.length > 32 || args.some(a => typeof a !== 'string' || a.length > 512 || a.includes('\0'))) throw new Error('VIBYRA_ACP_ARGS must be a JSON array of at most 32 short strings');
  const name = String(process.env.VIBYRA_ACP_NAME || program.split('/').pop()).replace(/[\u0000-\u001f]/g, '').slice(0, 40) || 'ACP agent';
  return new AcpProvider(program, args, name);
}
