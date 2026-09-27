// What a person says to the Vibyra assistant, and what must be true of the
// app afterwards. Each `check` returns the problems it found; none is a pass.
// The fixture's workspace (desktop-tauri/tests/assistantLiveSeed.ts):
//   PortfolioWebsite (open): #1 Claude Fable 5.1, busy adding a dark mode
//     toggle to the navbar · #2 shell running `next dev` · #3 exited shell ·
//     a Codex conversation (CODEX) fixing the contact form tests
//   HKE: #4 Claude waiting on "Do you want to proceed?" for `npm install sharp`
//   Vibyra: nothing open. Gemini CLI is not installed.

const CODEX = '3f9c2a71-5b8e-4d20-9a6f-1c2b3d4e5f60';
const newPanes = (s, agent) => s.panes.filter((p) => p.id > 20 && (!agent || p.agentId === agent));
const chatCreates = (s, provider) => s.log.filter((e) => e.command === 'shared_chat_create' && (!provider || (e.args.options?.provider ?? 'codex') === provider));
const launched = (s) => newPanes(s).length + chatCreates(s).length;
const writes = (s, id) => s.log.filter((e) => e.command === 'write_terminal' && e.args.id === id).map((e) => e.args.data);
const submits = (s, id) => s.log.filter((e) => e.command === 'shared_chat_request' && e.args.method === 'turn.submit' && e.args.params.sessionId === id).map((e) => e.args.params.text);
const stopped = (s, id) => s.log.some((e) => e.command === 'shared_chat_request' && e.args.method === 'session.stop' && e.args.params.sessionId === id);
const pane = (s, id) => s.panes.find((p) => p.id === id);
const expect = (ok, problem) => (ok ? [] : [problem]);
const mentions = (reply, pattern, what) => expect(pattern.test(reply), `reply never mentions ${what}: "${reply.slice(0, 160)}"`);
const noLaunch = (s) => expect(launched(s) === 0, `launched ${launched(s)} terminal(s) nobody asked for`);
const noFalseSuccess = (reply) => expect(!/\b(opened|launched|started|done)\b/i.test(reply) || /\b(not|couldn['’]?t|could not|isn['’]?t|wasn['’]?t|failed|unable|can['’]?t)\b/i.test(reply), `claims success: "${reply.slice(0, 160)}"`);
/** How many Codex terminals were opened and with what, whichever route. */
const codexLaunches = (s) => [
  ...chatCreates(s, 'codex').map((e) => ({ permission: e.args.options?.permissionMode, effort: e.args.options?.reasoningEffort, model: e.args.options?.model })),
  ...newPanes(s, 'codex').map((p) => ({ permission: p.permissionMode, effort: p.reasoningEffort, model: p.model })),
];

export const SCENARIOS = [
  // ── the transcript, word for word ─────────────────────────────────────────
  { name: 'transcript: what is the claude terminal doing', say: ['what is this claude termianl doing?'],
    check: ({ state, reply }) => [...mentions(reply, /dark mode|dark-mode|theme|navbar/i, 'the dark mode / navbar task on screen'), ...noLaunch(state)] },
  { name: 'transcript: its assigned job', say: ['what is this claude termianl doing?', 'yeah but whats its assigned job?'],
    check: ({ state, reply }) => [...mentions(reply, /dark mode|dark-mode/i, 'the job it was given'), ...mentions(reply, /navbar|nav bar|localStorage/i, 'the navbar/localStorage detail'), ...noLaunch(state)] },
  { name: 'transcript: full screen it', say: ['what is this claude termianl doing?', 'There we go! Can you full screen it please'],
    check: ({ state }) => [...expect(state.zoomedId === 1, `zoomedId is ${state.zoomedId}, not 1`), ...noLaunch(state)] },
  { name: 'transcript: full screen it didnt work', say: ['Can you full screen the claude terminal please', 'Full screen it didnt work..'],
    check: ({ state }) => [...expect(state.zoomedId === 1, `zoomedId is ${state.zoomedId}, not 1`), ...noLaunch(state)] },
  { name: 'transcript: full screen the codex terminal instead', say: ['full screen the claude terminal', 'Fiull screen the codex terminal instead'],
    check: ({ state }) => [...expect(state.chats.zoomed === CODEX, `codex chat not zoomed (${state.chats.zoomed})`), ...expect(state.zoomedId === null, 'claude still zoomed'), ...noLaunch(state)] },
  { name: 'transcript: 5 codex full permission low effort',
    say: ['Ok can u atleast launch 5 codex terminals please on this project give them full permission and also effort level low please'],
    check: ({ state, reply }) => {
      const codex = codexLaunches(state);
      return [...expect(codex.length === 5, `${codex.length} codex terminals, not 5`),
        ...expect(codex.every((c) => c.permission === 'full'), `permissions ${codex.map((c) => c.permission)}`),
        ...expect(codex.every((c) => c.effort === 'low'), `efforts ${codex.map((c) => c.effort)}`),
        ...expect(!/does not take|couldn.t|could not|not opened|didn.t open/i.test(reply), `reply reports a failure: ${reply}`)];
    } },
  { name: 'transcript: follow-up high effort', say: ['launch 2 codex terminals on this project', 'Oh... Ok jusst launch them with hiugh effort'],
    check: ({ state }) => {
      const high = codexLaunches(state).filter((c) => c.effort === 'high');
      return expect(high.length === 2, `${high.length} high-effort codex launches (all: ${JSON.stringify(codexLaunches(state))})`);
    } },

  // ── reading what terminals are doing ──────────────────────────────────────
  { name: 'read: overview of every terminal', say: ["what's going on in my terminals?"],
    check: ({ state, reply }) => [...mentions(reply, /dark mode|navbar|lint/i, 'what the Claude terminal is doing'), ...mentions(reply, /contact form|email|validat/i, 'what the Codex terminal is doing'), ...noLaunch(state)] },
  { name: 'read: codex conversation', say: ['what is codex working on?'],
    check: ({ state, reply }) => [...mentions(reply, /contact form|email|validat/i, 'the contact form fix'), ...noLaunch(state)] },
  { name: 'read: dev server', say: ['is my dev server running? what url?'],
    check: ({ reply }) => mentions(reply, /localhost:3000/i, 'localhost:3000') },
  { name: 'read: HKE terminal waiting', say: ['what is the claude terminal in HKE waiting for?'],
    check: ({ state, reply }) => [...mentions(reply, /sharp|npm install|permission|proceed|approv/i, 'the npm install sharp prompt'), ...noLaunch(state)] },
  { name: 'read: which need attention', say: ['does any terminal need me?'],
    check: ({ reply }) => mentions(reply, /HKE|#4|sharp|proceed|permission|approv/i, 'the HKE terminal waiting on a prompt') },

  // ── full screen / focus ───────────────────────────────────────────────────
  { name: 'fullscreen: by agent', say: ['maximise the claude terminal'],
    check: ({ state }) => [...expect(state.zoomedId === 1, `zoomedId ${state.zoomedId}`), ...noLaunch(state)] },
  { name: 'fullscreen: exit', say: ['full screen the claude terminal', 'ok exit full screen'],
    check: ({ state }) => [...expect(state.zoomedId === null && state.chats.zoomed === null, `still zoomed: ${state.zoomedId}/${state.chats.zoomed}`), ...noLaunch(state)] },
  { name: 'focus: dev server', say: ['switch to the dev server terminal'],
    check: ({ state }) => [...expect(state.focusedId === 2, `focusedId ${state.focusedId}`), ...noLaunch(state)] },
  { name: 'focus: other project terminal', say: ['show me the claude terminal in HKE'],
    check: ({ state }) => [...expect(state.activeId === 'hke', `active project ${state.activeId}`), ...expect(state.focusedId === 4, `focusedId ${state.focusedId}`), ...noLaunch(state)] },

  // ── opening ───────────────────────────────────────────────────────────────
  { name: 'open: named model', say: ['open 3 terminals with gpt astra'],
    check: ({ state }) => {
      const codex = codexLaunches(state);
      return [...expect(codex.length === 3, `${codex.length} codex, not 3`), ...expect(codex.every((c) => c.model === 'openai/gpt-6-astra'), `models ${codex.map((c) => c.model)}`)];
    } },
  { name: 'open: claude high effort', say: ['launch 2 claude terminals with high effort'],
    check: ({ state }) => {
      const claude = newPanes(state, 'claude');
      return [...expect(claude.length === 2, `${claude.length} claude panes`), ...expect(claude.every((p) => p.reasoningEffort === 'high'), `efforts ${claude.map((p) => p.reasoningEffort)}`)];
    } },
  { name: 'open: claude fable model', say: ['open a claude fable 5.1 terminal'],
    check: ({ state }) => {
      const claude = newPanes(state, 'claude');
      return [...expect(claude.length === 1, `${claude.length} claude panes`), ...expect(claude[0]?.model === 'anthropic/claude-fable-5.1', `model ${claude[0]?.model}`)];
    } },
  { name: 'open: plain shell', say: ['open a plain terminal'],
    check: ({ state }) => expect(newPanes(state, 'shell').length === 1 && launched(state) === 1, `launched ${JSON.stringify(state.panes.filter((p) => p.id > 20))}`) },
  { name: 'open: with a prompt', say: ['open a claude terminal and tell it to write a README'],
    check: ({ state }) => {
      const claude = newPanes(state, 'claude');
      return [...expect(claude.length === 1, `${claude.length} claude panes`), ...expect(claude[0] && writes(state, claude[0].id).some((d) => /readme/i.test(d)), 'README prompt never typed into it')];
    } },
  { name: 'open: not installed', say: ['open a gemini terminal'],
    check: ({ state, reply }) => [...noLaunch(state), ...mentions(reply, /not installed|isn.t installed/i, 'that Gemini is not installed'), ...noFalseSuccess(reply)] },
  { name: 'open: in another project', say: ['open a codex terminal in HKE'],
    check: ({ state }) => {
      const created = chatCreates(state, 'codex');
      const inHke = created.filter((e) => e.args.projectId === 'hke').length + newPanes(state, 'codex').filter((p) => p.projectId === 'hke').length;
      return expect(inHke === 1 && launched(state) === 1, `hke codex launches ${inHke}, total ${launched(state)}`);
    } },

  // ── talking to terminals ──────────────────────────────────────────────────
  { name: 'send: to claude', say: ['tell the claude terminal to also add a test for the toggle'],
    check: ({ state }) => [...expect(writes(state, 1).some((d) => /test/i.test(d)), `writes to #1: ${JSON.stringify(writes(state, 1))}`), ...noLaunch(state)] },
  { name: 'send: to codex', say: ['ask codex to run the whole test suite when it is done'],
    check: ({ state }) => [...expect(submits(state, CODEX).some((t) => /test/i.test(t)), `submits to chat-1: ${JSON.stringify(submits(state, CODEX))}`), ...noLaunch(state)] },
  { name: 'send: approve prompt', say: ['say yes to the prompt in the HKE claude terminal'],
    check: ({ state }) => expect(writes(state, 4).some((d) => /^(1|y|yes)?\r?$/i.test(d.trim()) || d === '\r' || /^1/.test(d)), `writes to #4: ${JSON.stringify(writes(state, 4))}`) },
  { name: 'send: interrupt', say: ['interrupt the claude terminal, it is going the wrong way'],
    check: ({ state }) => expect(writes(state, 1).some((d) => d === '\x1b' || d === '\x03'), `writes to #1: ${JSON.stringify(writes(state, 1))}`) },

  // ── closing, renaming, restarting ─────────────────────────────────────────
  { name: 'close: by number', say: ['close terminal 3'],
    check: ({ state }) => [...expect(!pane(state, 3), '#3 still open'), ...expect(pane(state, 1) && pane(state, 2), 'closed more than #3')] },
  { name: 'close: codex', say: ['close the codex terminal'],
    check: ({ state }) => [...expect(stopped(state, CODEX) && !state.chats.open.includes(CODEX), 'codex chat still open'), ...expect(state.panes.length === 4, `${state.panes.length} panes left`)] },
  { name: 'close: all in project', say: ['close all the terminals in this project'],
    check: ({ state }) => [...expect(state.panes.filter((p) => p.projectId === 'portfolio').length === 0, 'portfolio panes remain'), ...expect(!!pane(state, 4), 'closed the HKE terminal too'), ...expect(stopped(state, CODEX), 'codex chat left running')] },
  { name: 'rename: claude', say: ['rename the claude terminal to Dark mode'],
    check: ({ state }) => expect(pane(state, 1)?.customTitle === 'Dark mode', `title ${pane(state, 1)?.customTitle}`) },
  { name: 'restart: finished shell', say: ['restart terminal 3'],
    check: ({ state }) => expect(state.log.some((e) => e.command === 'create_terminal'), 'no relaunch reached the native side') },

  // ── projects ──────────────────────────────────────────────────────────────
  { name: 'project: list', say: ['what projects do I have?'],
    check: ({ state, reply }) => [...mentions(reply, /HKE/, 'HKE'), ...mentions(reply, /Vibyra/, 'Vibyra'), ...mentions(reply, /Portfolio/i, 'PortfolioWebsite'), ...noLaunch(state)] },
  { name: 'project: switch', say: ['switch to the hke project'],
    check: ({ state }) => [...expect(state.activeId === 'hke', `active ${state.activeId}`), ...noLaunch(state)] },
  { name: 'project: close to home', say: ['close this project and go back home'],
    check: ({ state }) => [...expect(state.view === 'home', `view ${state.view}`), ...expect(state.projects.length === 3, 'removed a project')] },
  { name: 'project: new', say: ['start a new project'],
    check: ({ state }) => expect(state.view === 'new-project', `view ${state.view}`) },
  { name: 'project: add folder', say: ['add ~/Desktop/Blog as a project'],
    check: ({ state }) => expect(state.projects.some((p) => p.root === '/Users/ellis/Desktop/Blog'), `projects ${state.projects.map((p) => p.root)}`) },
  { name: 'project: rename', say: ['rename this project to Portfolio'],
    check: ({ state }) => expect(state.projects.find((p) => p.id === 'portfolio')?.name === 'Portfolio', `names ${state.projects.map((p) => p.name)}`) },
  { name: 'project: remove', say: ['remove the HKE project from Vibyra'],
    check: ({ state }) => expect(!state.projects.some((p) => p.id === 'hke'), 'HKE still listed') },

  // ── the rest of the app ───────────────────────────────────────────────────
  { name: 'app: settings section', say: ['open the notification settings'],
    check: ({ state }) => expect(state.workspace.settingsOpen && state.workspace.settingsSection === 'notifications', `settings ${state.workspace.settingsOpen}/${state.workspace.settingsSection}`) },
  { name: 'app: preview', say: ['show me the preview'],
    check: ({ state }) => expect(state.workspace.companionTab === 'preview', `tab ${state.workspace.companionTab}`) },
  { name: 'app: worktrees', say: ['open worktrees'],
    check: ({ state }) => expect(state.workspace.companionTab === 'worktrees', `tab ${state.workspace.companionTab}`) },
  { name: 'app: history', say: ['open my saved chat history'],
    check: ({ state }) => expect(state.workspace.historyOpen, 'history closed') },
  { name: 'app: palette', say: ['open the command palette'],
    check: ({ state }) => expect(state.workspace.paletteOpen, 'palette closed') },
  { name: 'app: agents', say: ['which agents can I launch?'],
    check: ({ state, reply }) => [...mentions(reply, /codex/i, 'Codex'), ...mentions(reply, /claude/i, 'Claude'), ...noLaunch(state)] },
  { name: 'app: expand sidebar', say: ['make this chat panel full screen'],
    check: ({ state }) => expect(state.workspace.companionSize === 'full', `size ${state.workspace.companionSize}`) },

  // ── a question is not an action ───────────────────────────────────────────
  { name: 'question: about the project', say: ['what is this project built with?'],
    check: ({ state, reply }) => [...mentions(reply, /next/i, 'Next.js'), ...noLaunch(state), ...expect(state.zoomedId === null, 'zoomed something')] },
];
