let terminalSetupMode = "";
let setupTeamGoal = "";
let setupTeamSize = 0;

const terminalTeamRoleCatalog = {
  coordinator: {
    key: "coordinator",
    title: "Coordinator",
    icon: "network",
    detail: "Maps the goal and defines safe ownership",
    task: "Map the goal, relevant code paths, dependencies, and a safe implementation order.",
    editPolicy: "Remain read-only. Do not edit project files."
  },
  builder: {
    key: "builder",
    title: "Builder",
    icon: "code",
    detail: "Owns the production implementation",
    task: "Implement the smallest complete production change that satisfies the shared goal.",
    editPolicy: "You are the only production-code owner. Preserve unrelated work and keep edits scoped."
  },
  verifier: {
    key: "verifier",
    title: "Verifier",
    icon: "check",
    detail: "Finds the strongest validation path",
    task: "Inspect existing coverage and define or run the focused checks that prove the goal.",
    editPolicy: "Remain read-only. Do not edit source, tests, fixtures, or configuration."
  },
  reviewer: {
    key: "reviewer",
    title: "Reviewer",
    icon: "search",
    detail: "Challenges correctness, safety, and regressions",
    task: "Review the relevant implementation path for bugs, security risks, regressions, and missing validation.",
    editPolicy: "Remain read-only. Report findings with concrete evidence and file references."
  }
};

function resetTerminalTeamSetup() {
  terminalSetupMode = "";
  setupTeamGoal = "";
  setupTeamSize = 0;
  terminalTeamPlanning = false;
  terminalTeamPlanningError = "";
  terminalTeamPlanRequest += 1;
}

function normalizeTerminalTeamGoal(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function createTerminalTeamRecoveryId(seed = "") {
  const raw = String(seed || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `team-${Date.now().toString(36)}-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

function normalizeRendererTerminalTeamId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/^team-[a-z0-9-]{8,100}$/.test(raw)) return raw;
  return createTerminalTeamRecoveryId(raw);
}

function terminalHasTeamMetadata(terminal) {
  return Boolean(
    String(terminal?.teamId || "").trim()
    || String(terminal?.teamRoleKey || "").trim()
    || Number(terminal?.teamSize)
    || normalizeTerminalTeamGoal(terminal?.teamGoal)
  );
}

function repairTerminalTeamIds(items = []) {
  const repairGroups = new Map();
  items.forEach((terminal) => {
    if (!terminalHasTeamMetadata(terminal)) return;
    const currentId = normalizeRendererTerminalTeamId(terminal.teamId);
    if (currentId) {
      terminal.teamId = currentId;
      return;
    }
    const roleKey = String(terminal.teamRoleKey || "").trim().toLowerCase();
    const teamSize = Math.max(2, Math.min(4, Number(terminal.teamSize) || 4));
    const goal = normalizeTerminalTeamGoal(terminal.teamGoal);
    const fingerprint = [
      terminal.projectId,
      terminal.model,
      terminal.tokenMode,
      teamSize,
      goal
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    const groups = repairGroups.get(fingerprint) || [];
    let group = groups.find((candidate) => (
      candidate.members < teamSize && (!roleKey || !candidate.roles.has(roleKey))
    ));
    if (!group) {
      group = {
        id: createTerminalTeamRecoveryId(`restore|${fingerprint}|${groups.length}`),
        members: 0,
        roles: new Set()
      };
      groups.push(group);
      repairGroups.set(fingerprint, groups);
    }
    terminal.teamId = group.id;
    terminal.teamSize = teamSize;
    group.members += 1;
    if (roleKey) group.roles.add(roleKey);
  });
  return items;
}

function terminalTeamRequestFields(terminal, items = []) {
  if (!terminalHasTeamMetadata(terminal)) return {};
  repairTerminalTeamIds(items.length ? items : [terminal]);
  const teamId = normalizeRendererTerminalTeamId(terminal.teamId);
  const teamSize = Math.max(2, Math.min(4, Number(terminal.teamSize) || 0));
  const teamGoal = normalizeTerminalTeamGoal(terminal.teamGoal);
  const teamRoleKey = String(terminal.teamRoleKey || "").trim().toLowerCase();
  if (!teamId || !teamGoal || !teamRoleKey || teamSize < 2) {
    throw new Error("This Team record is incomplete. Close it and start the Team again.");
  }
  terminal.teamId = teamId;
  const teamPlanId = normalizeTerminalTeamText(terminal.teamPlanId, 120);
  return { teamId, teamSize, teamGoal, teamRoleKey, ...(teamPlanId ? { teamPlanId } : {}) };
}

function terminalTeamRoles(count) {
  const total = Math.max(2, Math.min(4, Number(count) || 4));
  const keys = total === 2
    ? ["builder", "reviewer"]
    : total === 3
      ? ["coordinator", "builder", "reviewer"]
      : ["coordinator", "builder", "verifier", "reviewer"];
  return keys.map((key) => terminalTeamRoleCatalog[key]);
}

function terminalTeamRuntimeIssue(model, tokenMode) {
  const runtime = typeof terminalExecutionRuntimeForModel === "function"
    ? terminalExecutionRuntimeForModel(model, tokenMode)
    : "";
  if (["codex", "claude", "vibyra-agent"].includes(runtime)) return "";
  if (String(model?.key || model?.modelKey || "").trim().toLowerCase() === "auto") {
    return "Choose a concrete model so Vibyra can enforce every Team role.";
  }
  return "This model cannot yet enforce Vibyra Team role instructions. Choose Codex, Claude, or a Vibyra Agent model.";
}

function terminalTeamSetupHtml(count, capacity) {
  return `<div class="terminal-team-setup${terminalTeamPlanning ? " is-planning" : ""}" data-terminal-team-setup>
    <label class="terminal-team-goal">
      <strong>Describe the outcome</strong>
      <textarea rows="4" maxlength="1200" data-terminal-team-goal placeholder="Audit light and dark mode across mobile and desktop, fix inconsistencies, and verify both themes." ${terminalTeamPlanning ? "disabled" : ""}>${escapeHtml(setupTeamGoal)}</textarea>
      <small>Vibyra will plan the smallest useful team.</small>
    </label>
    <div class="terminal-team-role-preview" aria-label="Planned team roles" aria-busy="${terminalTeamPlanning}" hidden></div>
    <p class="terminal-team-planning-status${terminalTeamPlanningError ? " is-visible" : ""}" data-terminal-team-status role="status" aria-live="polite">${escapeHtml(terminalTeamPlanningError)}</p>
  </div>`;
}

function terminalTeamSizePicker(capacity) {
  const choices = [
    { value: 0, label: "Automatic" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" }
  ];
  return `<div class="terminal-setup-block terminal-team-size">
    <p>Team size</p>
    <div role="radiogroup" aria-label="Team size">${choices.map(({ value, label }) => `<button class="${setupTeamSize === value ? "active" : ""}" type="button" role="radio" aria-checked="${setupTeamSize === value}" data-terminal-team-size="${value}" ${value > capacity || terminalTeamPlanning ? "disabled" : ""}>${label}</button>`).join("")}</div>
    <small>Automatic chooses the smallest useful team. One Builder owns production code.</small>
  </div>`;
}

function terminalTeamForTerminals(items) {
  const active = items.find((terminal) => terminal.id === activeTerminalId);
  const teamId = active?.teamId || items.find((terminal) => terminal.teamId)?.teamId || "";
  if (!teamId) return null;
  const members = items.filter((terminal) => terminal.teamId === teamId);
  if (members.length < 2) return null;
  return {
    id: teamId,
    goal: members[0].teamGoal || "",
    plannerMode: members[0].teamPlannerMode || "",
    plannerModel: members[0].teamPlannerModel || "",
    fallbackReason: members[0].teamPlannerFallbackReason || "",
    members
  };
}

function terminalTeamMemberState(terminal) {
  const state = typeof terminalStatusState === "function"
    ? terminalStatusState(terminal)
    : { key: terminal.pending ? "working" : "ready", label: terminal.pending ? "Starting" : "Ready" };
  if (state.key === "running") return { key: "working", label: "Working" };
  if (["attention", "error", "unavailable"].includes(state.key) || terminal.notice) {
    return { key: "attention", label: "Needs attention" };
  }
  if (state.key === "success" || state.key === "idle") return { key: "ready", label: "Ready" };
  return state.key === "stopped" ? state : { key: "ready", label: "Ready" };
}

function terminalTeamBarHtml(items) {
  const team = terminalTeamForTerminals(items);
  if (!team) return "";
  const working = team.members.filter((terminal) => {
    const key = terminalTeamMemberState(terminal).key;
    return key === "working" || key === "starting" || key === "busy";
  }).length;
  const source = typeof terminalTeamPlanSourceLabel === "function"
    ? terminalTeamPlanSourceLabel(team)
    : "";
  return `<aside class="terminal-team-bar" aria-label="Active team">
    <div class="terminal-team-summary">
      <span>${icon("people")}</span>
      <span><strong>${escapeHtml(team.goal)}</strong><small>${escapeHtml([source, working ? `${working} working` : "Review agent results"].filter(Boolean).join(" · "))}</small></span>
    </div>
    <div class="terminal-team-members" role="list" aria-label="Team roles">
      ${team.members.map((terminal) => {
        const state = terminalTeamMemberState(terminal);
        return `<button type="button" role="listitem" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(terminal.teamRole || terminal.title)}, ${escapeAttribute(state.label)}"><i class="${escapeAttribute(state.key)}"></i><span>${escapeHtml(terminal.teamRole || terminal.title)}</span><small>${escapeHtml(state.label)}</small></button>`;
      }).join("")}
    </div>
  </aside>`;
}
