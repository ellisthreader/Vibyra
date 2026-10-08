class ClaudeProvider {
  constructor(program) {
    this.turn = null; this.tools = new Map(); this.permissions = new Map(); this.stopped = false;
    this.wire = new ProviderWire(program, ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio', '--permission-mode', normalMode(program)], value => this.receive(value));
  }
  control(subtype, fields = {}) { const id = randomUUID(); return this.wire.request({ type: 'control_request', request_id: id, request: { subtype, ...fields } }, id); }
  async initialize() { this.capabilities = await this.control('initialize'); this.models = normalizedModels(this.capabilities.models ?? []); return {}; }
  async start(params) {
    this.thread = randomUUID(); this.model = params.model ?? this.models[0]?.model;
    this.model = claudeModelFor(this.model, this.models)?.model ?? this.model;
    if (!this.models.some(model => model.model === this.model)) throw new Error('Choose a model advertised by this Claude account');
    this.effort = params.config?.model_reasoning_effort ?? this.models.find(model => model.model === this.model).defaultReasoningEffort;
    // Access comes only from the Mac: the launch option, then the chat's Access menu each turn.
    // Questions Claude puts to the person and plan approval always go to them.
    this.access = params.approvalPolicy === 'never' ? 'full' : 'ask';
    await this.control('set_model', { model: this.model });
    this.appliedModel = this.model; this.appliedEffort = undefined;
    return { thread: { id: this.thread }, model: this.model, reasoningEffort: this.effort, approvalPolicy: this.access === 'full' ? 'never' : 'on-request', sandbox: { type: 'providerManaged' } };
  }
  async prompt(params) {
    if (this.turn) throw new Error('A Claude turn is already active');
    if (ACCESS.includes(params.access)) this.access = params.access;
    // Each control call is a round trip to the CLI before the prompt is even
    // written; repeating unchanged settings added seconds to every send.
    if (params.model !== this.appliedModel) { await this.control('set_model', { model: params.model }); this.appliedModel = params.model; }
    if (params.effort !== 'none' && params.effort !== this.appliedEffort) {
      await this.control('apply_flag_settings', { settings: { effortLevel: params.effort } }); this.appliedEffort = params.effort;
    }
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
    const answers = pending.questions && !value.error ? claudeAnswers(pending.input, value.result?.answers) : null;
    const allow = pending.questions ? Boolean(answers) : !value.error && value.result?.decision === 'accept';
    this.wire.write({ type: 'control_response', response: { subtype: 'success', request_id: value.id,
      response: allow ? { behavior: 'allow', updatedInput: answers ? { ...pending.input, answers } : pending.input }
        : { behavior: 'deny', message: pending.questions ? 'The user did not answer.' : 'The user declined this action.' } } });
    pending.answered = true;
  }
  textId(message) { return `${message}:${this.block ?? 0}`; }
  item(item, completed = false) { event(completed ? 'item/completed' : 'item/started', { threadId: this.thread, turnId: this.turn, item }); }
  receive(value) {
    if (value.type === 'control_response') { const response = value.response; this.wire.reply(response.request_id, response.response, response.subtype === 'error' ? response.error : null); return; }
    if (value.type === 'control_request') {
      const request = value.request;
      if (request.subtype !== 'can_use_tool' || !this.turn) { this.wire.write({ type: 'control_response', response: { subtype: 'error', request_id: value.request_id, error: 'Unsupported client request' } }); return; }
      if (request.tool_name === 'AskUserQuestion' && Array.isArray(request.input?.questions)) {
        this.permissions.set(value.request_id, { input: request.input, toolId: request.tool_use_id, questions: true });
        output({ id: value.request_id, method: 'item/tool/requestUserInput', params: { threadId: this.thread, turnId: this.turn, itemId: request.tool_use_id,
          questions: request.input.questions.map((q, index) => ({ id: String(index), header: q.header ?? '', question: q.question, isOther: true, isSecret: false,
            options: (q.options ?? []).map(o => ({ label: o.label, description: o.description ?? '' })) })) } }); return;
      }
      if (claudeAllows(this.access, request.tool_name)) {
        this.wire.write({ type: 'control_response', response: { subtype: 'success', request_id: value.request_id,
          response: { behavior: 'allow', updatedInput: request.input } } }); return;
      }
      this.permissions.set(value.request_id, { input: request.input, toolId: request.tool_use_id });
      output({ id: value.request_id, method: 'vibyra/tool/requestApproval', params: { threadId: this.thread, turnId: this.turn,
        itemId: request.tool_use_id, tool: request.tool_name, input: request.input, reason: request.input?.description ?? `Claude wants to use ${request.tool_name}.`, cwd: process.cwd(), availableDecisions: ['accept', 'decline'] } }); return;
    }
    if (!this.turn) return;
    if (value.type === 'assistant') {
      for (const block of value.message?.content ?? []) {
        // One event per content block, all sharing the message id: the block's stream index tells them apart.
        if (block.type === 'text') this.item({ type: 'agentMessage', id: this.textId(value.message.id), text: block.text }, true);
        if (block.type === 'tool_use') {
          this.tools.set(block.id, block);
          const item = claudeTool(block, process.cwd());
          if (item) this.item(item);
        }
      }
    }
    if (value.type === 'stream_event') {
      const e = value.event;
      if (e.type === 'message_start') { this.messageId = e.message.id; this.block = 0; }
      if (e.type === 'content_block_start') this.block = e.index;
      if (e.type === 'content_block_start' && e.content_block.type === 'text') this.item({ type: 'agentMessage', id: this.textId(this.messageId), text: '' });
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') event('item/agentMessage/delta', { threadId: this.thread, turnId: this.turn, itemId: this.textId(this.messageId), delta: e.delta.text });
    }
    if (value.type === 'user') for (const block of value.message?.content ?? []) {
      if (block.type !== 'tool_result') continue;
      const tool = this.tools.get(block.tool_use_id);
      const item = tool && claudeTool(tool, process.cwd(), { output: block.content, error: block.is_error, meta: value.tool_use_result });
      if (item) this.item(item, true);
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
// Claude renamed its normal interactive permission mode from "default" to "manual".
const ACCESS = ['ask', 'auto', 'full'];
const CLAUDE_EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
/** What the chat's access level answers without asking: edits in auto, everything but plan approval in full. */
function claudeAllows(access, tool) {
  if (tool === 'ExitPlanMode') return false;
  return access === 'full' || (access === 'auto' && CLAUDE_EDITS.has(tool));
}
function normalMode(program) {
  const help = require('node:child_process').spawnSync(program, ['--help'], { encoding: 'utf8', timeout: 10000 }).stdout ?? '';
  return help.includes('"manual"') ? 'manual' : 'default';
}
// Claude reads AskUserQuestion answers keyed by the question text; several choices join with commas.
function claudeAnswers(input, answers) {
  const picked = input.questions.map((q, index) => [q.question, (answers?.[String(index)]?.answers ?? []).join(', ')]);
  return picked.every(([, answer]) => answer) ? Object.fromEntries(picked) : null;
}

function claudeModelFor(wanted, models) {
  const normal = value => String(value).replace(/^anthropic\//, '').toLowerCase().replace(/\./g, '-');
  const key = normal(wanted);
  const exact = models.find(model => [model.model, model.resolvedModel].some(id => id && normal(id) === key));
  if (exact) return exact;
  const dated = models.filter(model => model.resolvedModel && normal(model.resolvedModel).replace(/-\d{8}$/, '') === key);
  return new Set(dated.map(model => model.resolvedModel)).size === 1 ? dated[0] : undefined;
}
