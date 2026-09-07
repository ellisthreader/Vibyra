import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NewAgentDialog } from "../../src/components/agentMode/NewAgentDialog";
import { RoutineEditor } from "../../src/components/agentMode/RoutineEditor";
import { SkillEditor } from "../../src/components/agentMode/SkillEditor";
import { AgentMemoryCard } from "../../src/components/agentMode/AgentMemoryCard";
import { AgentSkillsTab } from "../../src/components/agentMode/AgentSkillsTab";
import { useAgentRosterStore as roster } from "../../src/state/agentRosterStore";
import { useAgentWorkStore as work } from "../../src/state/agentWorkStore";
import { useAccountStore as account } from "../../src/state/accountStore";
import { useAgentModeStore as mode } from "../../src/state/agentModeStore";
import { useModalFocus } from "../../src/lib/useModalFocus";
import { ModalPortal } from "../../src/components/common/ModalPortal";
import { EditorDialog } from "../../src/components/agentMode/EditorDialog";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/styles/base-controls.css";
import "../../src/styles/controls.css";
import "../../src/styles/modals.css";
import "../../src/styles/agent-work.css";
import "../../src/styles/settings-rows.css";
import "../../src/styles/agent-settings.css";

const agent: any = { id: "qa-agent", name: "Audit", brief: "Useful context", engine: "claude",
  memoryBudget: 4000, reflection: "suggest", permission: "standard", homePath: "/tmp/qa" };
const skill: any = { id: "qa-skill", name: "Proof", status: "installed", trigger: "After changes",
  summary: "Check results", procedure: "Read the output", boundary: "Ask first", verification: "Expected output", version: 1 };
const routine: any = { id: "qa-routine", agentId: agent.id, name: "Morning", instruction: "Read results",
  schedule: { kind: "daily", minuteOfDay: 540 }, timezone: "UTC", permission: "plan" };
const cap = (engine: string, structured = true) => ({ engine, structured, installed: structured,
  version: "fixture", supportsModel: true, supportsEffort: true, blocker: structured ? null : "Provider unavailable" });
const native = (window as any).__AUDIT_NATIVE_SNAPSHOT__ ?? { calls: {}, receipts: {}, memory: [], assigned: [], agents: [] };
const faults: Record<string, string> = {};
const pending: Record<string, (() => void)[]> = {};
async function invoke(command: string, args: any = {}) {
  const listSnapshot = command === "agent_profile_list" ? [...native.agents] : null;
  native.calls[command] = (native.calls[command] ?? 0) + 1;
  if (faults[command] === "delay") await new Promise<void>(resolve => (pending[command] ??= []).push(resolve));
  if (faults[command] === "reject") throw new Error(`Save failed: ${command}`);
  let result: any = [];
  if (command === "agent_write_receipt") return native.receipts[args.requestId] ?? null;
  if (command === "routine_zones") return ["UTC"];
  if (command === "agent_profile_list") return listSnapshot;
  if (command === "agent_profile_create") { result = { ...agent, ...args.request, id: `created-${native.calls[command]}` }; native.agents.push(result); }
  if (command === "agent_engine_capabilities") return [cap("claude"), cap("codex")];
  if (command === "skill_list") return [skill];
  if (command === "skill_install" || command === "skill_revise") result = { ...skill, ...args.draft };
  if (command === "routine_create" || command === "routine_update") result = { ...routine, ...args.draft };
  if (command === "agent_memory_list") return native.memory;
  if (command === "agent_memory_add") { result = { ...args.entry, id: `memory-${native.calls[command]}`, agentId: args.agentId, status: "active" }; native.memory.push(result); }
  if (command === "skill_assigned") return native.assigned.map(() => skill);
  if (command === "skill_assign") native.assigned = args.enabled ? [args.skillId] : [];
  if (args.requestId) native.receipts[args.requestId] = { operation: command, result };
  if (faults[command] === "lost") throw new Error("Native reply lost after commit");
  return result;
}
(window as any).__TAURI_INTERNALS__ = { invoke };
const root = createRoot(document.getElementById("root")!);
function FocusProbe({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, true, close, undefined, () => { native.restoredInert = !!document.querySelector('.shell[inert]'); });
  return <ModalPortal><div ref={ref} role="dialog" aria-label="Focus probe">
    <div tabIndex={-1} data-autofocus>Static heading</div>
    <button>First action</button><button onClick={close}>Last action</button>
  </div></ModalPortal>;
}
function Host({ kind, edit = false }: { kind: string; edit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <div className="app"><div className="chrome">Fixture workspace</div><div className="shell">
    <button id="opener" onClick={() => setOpen(true)}>Open form</button>
    {kind === "memory" && <AgentMemoryCard agent={agent} />}
    {kind === "assignment" && <AgentSkillsTab agent={agent} />}
    {open && kind === "focus" && <FocusProbe close={() => setOpen(false)} />}
    {open && kind === "agent" && <NewAgentDialog onClose={() => setOpen(false)} />}
    {open && kind === "routine" && <RoutineEditor routineId={edit ? routine.id : undefined} onClose={() => setOpen(false)} />}
    {open && kind === "skill" && <SkillEditor skillId={edit ? skill.id : undefined} onClose={() => setOpen(false)} />}
    {open && kind === "nested" && <EditorDialog title="Outer" submitLabel="Save" onSubmit={() => {}} onClose={() => setOpen(false)}>
      <button onClick={() => setNested(true)} type="button">Open inner</button>
      {nested && <EditorDialog title="Inner" submitLabel="Save" onSubmit={() => {}} onClose={() => setNested(false)}><input data-autofocus /></EditorDialog>}
    </EditorDialog>}
  </div></div>;
}
function reset() {
  flushSync(() => root.render(null));
  for (const key of Object.keys(faults)) delete faults[key];
  native.calls = {}; native.receipts = {}; native.memory = []; native.assigned = []; native.agents = [];
  localStorage.clear(); roster.getState().clear(); work.getState().clear();
  account.setState({ snapshot: { status: "signedIn", profile: { welcomeKey: "qa-account" } } as any });
  roster.setState({ agents: [agent], capabilities: [cap("claude"), cap("codex")], loading: false });
  work.setState({ skills: [skill], routines: [routine] });
}
(window as any).qa = {
  reset, native, faults,
  render: (kind: string, edit = false) => { flushSync(() => root.render(null)); flushSync(() => root.render(<Host kind={kind} edit={edit} />)); },
  release: (command: string) => { delete faults[command]; (pending[command] ?? []).splice(0).forEach(resolve => resolve()); },
  account: (welcomeKey: string) => { account.setState({ snapshot: { status: "signedIn", profile: { welcomeKey } } as any }); roster.getState().clear(); work.getState().clear(); },
  createDirect: (name: string) => roster.getState().create(name, "", "claude"),
  loadRoster: () => roster.getState().load(),
  capabilities: (entries: any[], loading = false) => roster.setState({ capabilities: entries.map(([engine, ready]) => cap(engine, ready)), loading }),
  stores: () => ({ agents: roster.getState().agents, memory: work.getState().memory, skills: work.getState().skills, routines: work.getState().routines, selected: mode.getState().agentId, error: roster.getState().error }),
};
account.setState({ snapshot: { status: "signedIn", profile: { welcomeKey: "qa-account" } } as any });
roster.setState({ agents: [agent], capabilities: [cap("claude"), cap("codex")], loading: false });
work.setState({ skills: [skill], routines: [routine] });
