// Claude Code and Gemini tool calls, as the Codex app-server item types the engine
// already presents: a command with its output, files read or searched, file
// changes with a real diff, a web lookup, a plan. Anything else stays a named tool.
const shorten = (cwd, path) => typeof path === 'string' && path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path;
const fileName = path => String(path ?? '').split('/').pop();
const textOf = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(part => part?.text ?? part?.content?.text ?? '').filter(Boolean).join('\n') : '';
const hunks = patches => patches.map(h => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join('\n')}`).join('\n');
const statusOf = done => !done ? 'inProgress' : done.error ? 'failed' : 'completed';
const lookup = (id, cwd, status, output, type, fields) => ({ type: 'commandExecution', id, cwd, status,
  command: fields.command, aggregatedOutput: output ?? null, commandActions: [{ type, ...fields }] });

/** A line diff with three lines of context, for tools that report only the old and new text. */
function lineDiff(before, after) {
  const a = String(before ?? '').split('\n'), b = String(after ?? '').split('\n');
  if (a.length * b.length > 4e6) return `@@ -1,${a.length} +1,${b.length} @@\n${a.map(l => '-' + l).concat(b.map(l => '+' + l)).join('\n')}`;
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  for (let i = 0, j = 0; i < a.length || j < b.length;) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push([' ', a[i], i++, j++]); continue; }
    // A removed line comes before the line that replaces it, as in `diff -u`.
    if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) ops.push(['-', a[i], i++, j]);
    else ops.push(['+', b[j], i, j++]);
  }
  // Changes closer than seven unchanged lines share a hunk, as `diff -u` groups them.
  const changed = ops.flatMap((op, k) => op[0] === ' ' ? [] : [k]);
  const out = [];
  for (let first = 0; first < changed.length;) {
    let last = first;
    while (last + 1 < changed.length && changed[last + 1] - changed[last] <= 7) last++;
    const part = ops.slice(Math.max(0, changed[first] - 3), Math.min(ops.length, changed[last] + 4));
    const olds = part.filter(op => op[0] !== '+').length, news = part.filter(op => op[0] !== '-').length;
    out.push(`@@ -${part[0][2] + 1},${olds} +${part[0][3] + 1},${news} @@`, ...part.map(op => op[0] + op[1]));
    first = last + 1;
  }
  return out.join('\n');
}

const created = content => {
  const lines = String(content ?? '').replace(/\n$/, '').split('\n');
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map(line => '+' + line).join('\n')}`;
};

/** `done` is the tool's outcome once known: `{ output, error, meta }`. */
function claudeTool(block, cwd, done) {
  const input = block.input ?? {}, id = block.id, status = statusOf(done), output = done ? textOf(done.output) : null;
  const path = shorten(cwd, input.file_path ?? input.notebook_path ?? input.path);
  switch (block.name) {
    case 'Bash': return { type: 'commandExecution', id, cwd, status, command: input.command, aggregatedOutput: output,
      commandActions: [{ type: 'unknown', command: input.command }] };
    case 'Read': return lookup(id, cwd, status, output, 'read', { command: `read ${path}`, name: fileName(path), path });
    case 'Grep': return lookup(id, cwd, status, output, 'search', { command: `grep ${input.pattern}`, query: input.pattern, path: shorten(cwd, input.path) ?? null });
    case 'Glob': return lookup(id, cwd, status, output, 'listFiles', { command: `glob ${input.pattern}`, path: input.pattern });
    case 'LS': return lookup(id, cwd, status, output, 'listFiles', { command: `ls ${path}`, path });
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': {
      const meta = done?.meta ?? {};
      const diff = Array.isArray(meta.structuredPatch) && meta.structuredPatch.length ? hunks(meta.structuredPatch)
        : meta.type === 'create' ? created(meta.content ?? input.content)
        : done && block.name === 'Edit' ? lineDiff(input.old_string, input.new_string) : '';
      return { type: 'fileChange', id, status, changes: [{ path, diff,
        kind: { type: block.name === 'Write' && (meta.type === 'create' || !done) ? 'add' : 'update' } }] };
    }
    case 'WebFetch': return { type: 'webSearch', id, status, query: input.url, action: { type: 'openPage', url: input.url } };
    case 'WebSearch': return { type: 'webSearch', id, status, query: input.query, action: { type: 'search', query: input.query } };
    case 'TodoWrite': return { type: 'plan', id, status: 'completed', text: (input.todos ?? [])
      .map(todo => `- [${todo.status === 'completed' ? 'x' : todo.status === 'in_progress' ? '~' : ' '}] ${todo.content}`).join('\n') };
    case 'ExitPlanMode': return { type: 'plan', id, status: 'completed', text: input.plan ?? '' };
    case 'AskUserQuestion': return null; // Shown as its question card.
    default: {
      const [, server, tool] = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(block.name) ?? [];
      return { type: 'mcpToolCall', id, status, server: server ?? 'Claude', tool: tool ?? block.name, arguments: input,
        result: output, ...(block.name === 'Task' || block.name === 'Agent' ? { tool: 'Task', arguments: { description: input.description } } : {}) };
    }
  }
}

/** Gemini ACP tool calls carry a kind, locations and content (text or diffs). */
function geminiTool(tool, cwd) {
  const id = tool.toolCallId, status = tool.status === 'completed' || tool.status === 'failed' ? tool.status : 'inProgress';
  const path = shorten(cwd, tool.locations?.[0]?.path), output = textOf(tool.content) || null, title = tool.title ?? tool.kind ?? 'Tool';
  switch (tool.kind) {
    case 'execute': { const command = tool.rawInput?.command ?? title;
      return { type: 'commandExecution', id, cwd, status, command, aggregatedOutput: output, commandActions: [{ type: 'unknown', command }] }; }
    case 'read': return lookup(id, cwd, status, output, 'read', { command: title, name: fileName(path ?? title), path: path ?? title });
    case 'search': return lookup(id, cwd, status, output, 'search', { command: title, query: tool.rawInput?.pattern ?? title, path });
    case 'edit': case 'delete': case 'move': return { type: 'fileChange', id, status,
      changes: (tool.content ?? []).filter(part => part.type === 'diff').map(part => ({ path: shorten(cwd, part.path),
        kind: { type: part.oldText == null ? 'add' : tool.kind === 'delete' ? 'delete' : 'update' }, diff: part.oldText == null ? created(part.newText) : lineDiff(part.oldText, part.newText ?? '') })) };
    case 'fetch': return { type: 'webSearch', id, status, query: tool.rawInput?.url ?? title, action: { type: 'openPage', url: tool.rawInput?.url } };
    default: return { type: 'mcpToolCall', id, status, server: 'Gemini', tool: title, arguments: tool.rawInput, result: tool.content };
  }
}
