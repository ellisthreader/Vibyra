class GeminiProvider {
  constructor(program) {
    this.turn = null; this.tools = new Map(); this.permissions = new Map();
    this.wire = new ProviderWire(program, ['--acp'], value => this.receive(value));
  }
  rpc(method, params) { const id = randomUUID(); return this.wire.request({ jsonrpc: '2.0', id, method, params }, id); }
  async initialize() {
    this.capabilities = await this.rpc('initialize', { protocolVersion: 1, clientInfo: { name: 'Vibyra', version: '0.7.5' }, clientCapabilities: {} });
    return {};
  }
  async start(params) {
    if (params.approvalPolicy === 'never') throw new Error('Gemini structured sessions require normal tool approvals. Choose Standard access.');
    const session = await this.rpc('session/new', { cwd: process.cwd(), mcpServers: [] });
    this.thread = session.sessionId;
    this.models = (session.models?.availableModels ?? []).map(model => ({ model: model.modelId, displayName: model.name, defaultReasoningEffort: 'none', supportedReasoningEfforts: [{ reasoningEffort: 'none', description: 'Managed by Gemini' }] }));
    this.model = params.model ?? session.models?.currentModelId;
    if (!this.models.some(model => model.model === this.model)) throw new Error('This Gemini session did not advertise the selected model');
    if (params.model && params.model !== session.models?.currentModelId) await this.rpc('session/set_model', { sessionId: this.thread, modelId: this.model });
    return { thread: { id: this.thread }, model: this.model, reasoningEffort: 'none', approvalPolicy: 'on-request', sandbox: { type: 'providerManaged' } };
  }
  async prompt(params) {
    if (this.turn) throw new Error('A Gemini turn is already active');
    if (params.model !== this.model) { await this.rpc('session/set_model', { sessionId: this.thread, modelId: params.model }); this.model = params.model; }
    const prompt = params.input.map(input => input.type === 'text' ? { type: 'text', text: input.text }
      : input.type === 'image' && input.url?.startsWith('data:') ? { type: 'image', mimeType: input.url.split(';')[0].slice(5), data: input.url.split(',')[1] } : null);
    if (prompt.some(input => !input)) throw new Error('This attachment type is unavailable for Gemini');
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
  }
  receive(value) {
    if (!value.method) { this.wire.reply(value.id, value.result, value.error?.message); return; }
    if (value.id != null) {
      if (value.method !== 'session/request_permission' || !this.turn) { this.wire.write({ jsonrpc: '2.0', id: value.id, error: { code: -32601, message: 'Unsupported client operation' } }); return; }
      const p = value.params;
      this.permissions.set(value.id, { ...p, answered: false });
      output({ id: value.id, method: 'vibyra/tool/requestApproval', params: { threadId: this.thread, turnId: this.turn,
        itemId: p.toolCall.toolCallId, tool: p.toolCall.title, input: p.toolCall.rawInput ?? p.toolCall.content ?? {}, reason: `Allow Gemini: ${p.toolCall.title}?`, cwd: process.cwd(), availableDecisions: ['accept', 'decline'] } }); return;
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
      event(completed ? 'item/completed' : 'item/started', { threadId: this.thread, turnId: this.turn, item: { type: 'mcpToolCall', id: tool.toolCallId, server: 'Gemini', tool: tool.title ?? tool.kind ?? 'Tool', arguments: tool.rawInput, result: tool.content, status: tool.status } });
      if (completed) for (const [id, permission] of this.permissions) if (permission.toolCall.toolCallId === tool.toolCallId && permission.answered) {
        event('serverRequest/resolved', { threadId: this.thread, requestId: id }); this.permissions.delete(id);
      }
    }
  }
}
