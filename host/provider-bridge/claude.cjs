class ClaudeProvider {
  constructor(program) {
    this.turn = null; this.tools = new Map(); this.permissions = new Map(); this.stopped = false;
    this.wire = new ProviderWire(program, ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio', '--permission-mode', 'default'], value => this.receive(value));
  }
  control(subtype, fields = {}) { const id = randomUUID(); return this.wire.request({ type: 'control_request', request_id: id, request: { subtype, ...fields } }, id); }
  async initialize() { this.capabilities = await this.control('initialize'); this.models = normalizedModels(this.capabilities.models ?? []); return {}; }
  async start(params) {
    this.thread = randomUUID(); this.model = params.model ?? this.models[0]?.model;
    this.model = this.models.find(model => model.model === this.model || model.resolvedModel === this.model)?.model ?? this.model;
    if (!this.models.some(model => model.model === this.model)) throw new Error('Choose a model advertised by this Claude account');
    this.effort = params.config?.model_reasoning_effort ?? this.models.find(model => model.model === this.model).defaultReasoningEffort;
    // Full access is only enabled from the locally approved launch option.
    if (params.approvalPolicy === 'never') throw new Error('Claude structured sessions require normal tool approvals. Choose Standard access.');
    await this.control('set_model', { model: this.model });
    return { thread: { id: this.thread }, model: this.model, reasoningEffort: this.effort, approvalPolicy: 'on-request', sandbox: { type: 'providerManaged' } };
  }
  async prompt(params) {
    if (this.turn) throw new Error('A Claude turn is already active');
    await this.control('set_model', { model: params.model });
    if (params.effort !== 'none') await this.control('apply_flag_settings', { settings: { effortLevel: params.effort } });
    this.turn = randomUUID(); this.stopped = false;
    const content = params.input.map(input => input.type === 'image' && input.url?.startsWith('data:')
      ? { type: 'image', source: { type: 'base64', media_type: input.url.split(';')[0].slice(5), data: input.url.split(',')[1] } }
      : input.type === 'text' ? { type: 'text', text: input.text } : null);
    if (content.some(input => !input)) { this.turn = null; throw new Error('This attachment type is unavailable for Claude'); }
    const id = this.turn;
    event('turn/started', { threadId: this.thread, turn: { id } });
    this.wire.write({ type: 'user', message: { role: 'user', content }, session_id: this.thread, parent_tool_use_id: null });
    return { turn: { id } };
  }
  async interrupt() { this.stopped = true; await this.control('interrupt'); return {}; }
  resolve(value) {
    const pending = this.permissions.get(value.id); if (!pending) return;
    const allow = !value.error && value.result?.decision === 'accept';
    this.wire.write({ type: 'control_response', response: { subtype: 'success', request_id: value.id,
      response: allow ? { behavior: 'allow', updatedInput: pending.input } : { behavior: 'deny', message: 'The user declined this action.' } } });
    pending.answered = true;
  }
  item(item, completed = false) { event(completed ? 'item/completed' : 'item/started', { threadId: this.thread, turnId: this.turn, item }); }
  receive(value) {
    if (value.type === 'control_response') { const response = value.response; this.wire.reply(response.request_id, response.response, response.subtype === 'error' ? response.error : null); return; }
    if (value.type === 'control_request') {
      const request = value.request;
      if (request.subtype !== 'can_use_tool' || !this.turn) { this.wire.write({ type: 'control_response', response: { subtype: 'error', request_id: value.request_id, error: 'Unsupported client request' } }); return; }
      this.permissions.set(value.request_id, { input: request.input, toolId: request.tool_use_id });
      output({ id: value.request_id, method: 'vibyra/tool/requestApproval', params: { threadId: this.thread, turnId: this.turn,
        itemId: request.tool_use_id, tool: request.tool_name, input: request.input, reason: `Allow Claude to use ${request.tool_name}?`, cwd: process.cwd(), availableDecisions: ['accept', 'decline'] } }); return;
    }
    if (!this.turn) return;
    if (value.type === 'assistant') {
      for (const block of value.message?.content ?? []) {
        if (block.type === 'text') this.item({ type: 'agentMessage', id: `${value.message.id}:text`, text: block.text }, true);
        if (block.type === 'tool_use') {
          this.tools.set(block.id, block);
          this.item({ type: 'mcpToolCall', id: block.id, server: 'Claude', tool: block.name, arguments: block.input });
        }
      }
    }
    if (value.type === 'stream_event') {
      const e = value.event;
      if (e.type === 'message_start') this.messageId = e.message.id;
      if (e.type === 'content_block_start' && e.content_block.type === 'text') this.item({ type: 'agentMessage', id: `${this.messageId}:text`, text: '' });
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') event('item/agentMessage/delta', { threadId: this.thread, turnId: this.turn, itemId: `${this.messageId}:text`, delta: e.delta.text });
    }
    if (value.type === 'user') for (const block of value.message?.content ?? []) {
      if (block.type !== 'tool_result') continue;
      const tool = this.tools.get(block.tool_use_id);
      if (tool) this.item({ type: 'mcpToolCall', id: tool.id, server: 'Claude', tool: tool.name, arguments: tool.input, result: block.content, status: block.is_error ? 'failed' : 'completed' }, true);
      for (const [id, permission] of this.permissions) if (permission.toolId === block.tool_use_id && permission.answered) {
        event('serverRequest/resolved', { threadId: this.thread, requestId: id }); this.permissions.delete(id);
      }
    }
    if (value.type === 'result') {
      event('thread/tokenUsage/updated', { threadId: this.thread, tokenUsage: { total: { inputTokens: value.usage?.input_tokens ?? 0, outputTokens: value.usage?.output_tokens ?? 0, cachedInputTokens: value.usage?.cache_read_input_tokens ?? 0 }, provider: 'claude', costUsd: value.total_cost_usd } });
      event('turn/completed', { threadId: this.thread, turn: { id: this.turn, status: this.stopped ? 'interrupted' : value.is_error ? 'failed' : 'completed', error: value.is_error ? { message: value.result ?? value.errors?.join('\n') ?? 'Claude could not complete this turn' } : null } });
      this.turn = null; this.tools.clear(); this.permissions.clear();
    }
  }
}
