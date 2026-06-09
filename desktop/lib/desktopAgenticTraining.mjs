const AGENTIC_CUE = /\b(subagents?|sub-agents?|agent team|multi-agent|multiple terminals?|parallel agents?|fully agentic)\b/i;
const WORKFLOW_CUE = /\bplan\b[\s\S]*\b(?:implement|review)\b[\s\S]*\b(?:implement|review)\b/i;
const DELIVERY_CUE = /\b(add|build|change|clean up|create|debug|fix|implement|improve|migrate|optimi[sz]e|refactor|repair|review|ship|test|update)\b/i;

export const DESKTOP_AGENTIC_TRAINING_EXAMPLES = [
  {
    request: "Use subagents to plan, implement, test, and review this feature.",
    route: "agentic_terminal_job",
    roles: ["planner", "worker", "worker", "reviewer"]
  },
  {
    request: "Open six terminals and have parallel agents refactor the app.",
    route: "agentic_terminal_job",
    roles: ["planner", "worker", "worker", "worker", "worker", "reviewer"]
  },
  {
    request: "Explain what subagents are.",
    route: "chat",
    roles: []
  }
];

export function agenticTerminalJobForPrompt(prompt, context = {}) {
  const goal = clean(prompt, 6000);
  if (!goal || (!AGENTIC_CUE.test(goal) && !WORKFLOW_CUE.test(goal)) || !DELIVERY_CUE.test(goal)) return null;

  const count = requestedAgentCount(goal);
  const workerCount = Math.max(1, count - 2);
  const skills = routedSkills(goal);
  const assignments = [
    assignment("planner", 0, plannerPrompt(goal, workerCount, skills)),
    ...Array.from({ length: workerCount }, (_, index) => (
      assignment("worker", index + 1, workerPrompt(goal, index + 1, workerCount, skills))
    )),
    assignment("reviewer", 0, reviewerPrompt(goal, workerCount, skills))
  ];

  return {
    type: "run_agentic_terminal_job",
    goal,
    count: assignments.length,
    agent: terminalAgent(goal),
    model: terminalModel(goal),
    effort: terminalEffort(goal),
    permissionMode: fullAccess(goal) ? "full" : "standard",
    projectId: clean(context.projectId, 300),
    skills,
    assignments
  };
}

function assignment(role, index, prompt) {
  const title = role === "planner"
    ? "Planner"
    : role === "reviewer"
      ? "Reviewer"
      : `Worker ${index}`;
  return { role, index, title, prompt };
}

function plannerPrompt(goal, workerCount, skills) {
  return commonPrompt("Planner", goal, skills) + `

Coordinate this job before implementation.
1. Create {{JOB_DIR}}.
2. Inspect the repo instructions, relevant memory, and matching local skills.
3. Write {{JOB_DIR}}/plan.md with a concise reviewed plan, risks, validation, and exactly ${workerCount} disjoint ownership sections named worker-1 through worker-${workerCount}.
4. Do not implement product code.
5. When the plan is complete, write {{JOB_DIR}}/planner.done with a short summary.
Do not finish before both files exist.`;
}

function workerPrompt(goal, index, workerCount, skills) {
  return commonPrompt(`Worker ${index}`, goal, skills) + `

You are one of ${workerCount} implementation workers sharing the same worktree.
1. Wait until {{JOB_DIR}}/planner.done exists, checking periodically for up to 10 minutes.
2. Read {{JOB_DIR}}/plan.md and take only the section named worker-${index}.
3. Do not revert or overwrite other workers' changes. Respect the assigned file ownership.
4. Implement the assigned slice and run the narrowest useful checks.
5. Write {{JOB_DIR}}/worker-${index}.done with files changed, checks run, and blockers.
If the plan gives no product-code ownership to worker-${index}, perform only the validation or analysis assigned there.`;
}

function reviewerPrompt(goal, workerCount, skills) {
  const markers = Array.from({ length: workerCount }, (_, index) => `worker-${index + 1}.done`).join(", ");
  return commonPrompt("Reviewer", goal, skills) + `

Review and integrate only after implementation is complete.
1. Wait until {{JOB_DIR}}/planner.done and all worker markers exist: ${markers}.
2. Read the plan and every worker summary.
3. Review the combined diff with findings first. Check behavior, permissions, persistence, and missing tests.
4. Run the relevant validation. Make only necessary integration or bug-fix edits; do not broaden scope.
5. Write {{JOB_DIR}}/review.md with findings and verification, then write {{JOB_DIR}}/reviewer.done.
Do not mark the review complete while known blocking findings remain.`;
}

function commonPrompt(role, goal, skills) {
  return `Vibyra assigned you the ${role} role for a coordinated terminal job.

Goal:
${goal}

Required operating rules:
- Read AGENTS.md and obey repository instructions before broad exploration.
- Inspect and follow matching .agents/skills/*/SKILL.md files. Suggested skills: ${skills.join(", ")}.
- Treat existing worktree changes as user or teammate work; never revert them.
- Keep permissions at the terminal's configured level and ask for approval when required.
- Communicate through files under {{JOB_DIR}} so the other agents can coordinate.`;
}

function requestedAgentCount(text) {
  const explicit = text.match(/\b(\d{1,2})\s+(?:ai\s+)?(?:agents?|subagents?|sub-agents?|terminals?)\b/i);
  if (!explicit) return 4;
  const count = Number.parseInt(explicit[1], 10);
  return Math.min(12, Math.max(3, Number.isFinite(count) ? count : 4));
}

function routedSkills(text) {
  const skills = new Set(["plan", "VibyraObsiden"]);
  if (/\b(refactor|clean up|organi[sz]e|split)\b/i.test(text)) skills.add("VibyraRefactor");
  if (/\b(optimi[sz]e|permission|approval|secret|token|auth|security)\b/i.test(text)) skills.add("VibyraOptimse");
  if (/\b(frontend|ui|ux|screen|page|layout|style|css|theme)\b/i.test(text)) skills.add("VibyraDesktopFrontendDesign");
  if (/\b(pair|pairing|reconnect|connection|phone)\b/i.test(text)) skills.add("vibyra-desktop-connection-diagnostics");
  return [...skills];
}

function terminalModel(text) {
  const normalized = text.toLowerCase().replace(/_/g, "-");
  const version = normalized.match(/\b(?:gpt|codex)?[\s-]*(5(?:\.\d+)?)(?:[\s-]*(mini|nano|codex))?\b/);
  if (version) return `gpt-${version[1]}${version[2] ? `-${version[2]}` : ""}`;
  if (/\bclaude\b/.test(normalized)) return "claude-sonnet-4";
  if (/\bgemini\b/.test(normalized)) return "gemini-2.5-pro";
  if (/\bcodex\b/.test(normalized)) return "gpt-5-codex";
  return "auto";
}

function terminalAgent(text) {
  if (/\bclaude\b/i.test(text)) return "claude";
  if (/\bgemini\b/i.test(text)) return "gemini";
  return "codex";
}

function terminalEffort(text) {
  if (/\b(fast|quick|low effort|low reasoning)\b/i.test(text)) return "low";
  if (/\b(extra high|xhigh|maximum reasoning)\b/i.test(text)) return "xhigh";
  if (/\b(high effort|deep reasoning)\b/i.test(text)) return "high";
  return "medium";
}

function fullAccess(text) {
  return /\b(full permissions?|full access|no sandbox|without (?:a )?sandbox|bypass (?:all )?approvals?)\b/i.test(text);
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}
