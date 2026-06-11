import { randomUUID } from "node:crypto";
import {
  assignmentsFromProposal,
  deterministicAssignments
} from "./terminalTeamPlannerAssignments.mjs";
import {
  chooseTerminalTeamTopology,
  normalizeTerminalTeamInput
} from "./terminalTeamPlannerInput.mjs";
import {
  TERMINAL_TEAM_PLAN_SCHEMA_VERSION,
  hashCanonical
} from "./terminalTeamPlannerShared.mjs";
import {
  validateTerminalTeamProposalForTopology
} from "./terminalTeamProposalValidation.mjs";
import {
  storeTerminalTeamPlan,
  teamPlanById as storedTeamPlanById
} from "./terminalTeamPlanStore.mjs";

export { TERMINAL_TEAM_PLAN_SCHEMA_VERSION };

export function planTerminalTeam(input = {}, { proposal = null } = {}) {
  const intent = normalizeTerminalTeamInput(input);
  const topology = chooseTerminalTeamTopology(intent);
  const accepted = acceptedProposal(proposal, topology, intent.fallbackReason);
  const plannerMode = accepted.proposal ? intent.plannerMode : "deterministic";
  const plannerModel = accepted.proposal ? intent.plannerModel : "";
  const assignments = accepted.proposal
    ? assignmentsFromProposal(accepted.proposal, topology, intent.goal)
    : deterministicAssignments(intent.goal, topology);
  const core = {
    schemaVersion: TERMINAL_TEAM_PLAN_SCHEMA_VERSION,
    teamSize: topology.length,
    goal: intent.goal,
    plannerMode,
    plannerModel,
    orchestrationMode: "parallel-v1",
    fallbackReason: accepted.proposal ? null : accepted.fallbackReason,
    assignments
  };
  const planHash = hashCanonical(core);
  return storeTerminalTeamPlan({
    planId: `team-plan-${randomUUID()}`,
    teamId: `team-${randomUUID()}`,
    planHash,
    ...core
  });
}

export function teamPlanById(planId) {
  return storedTeamPlanById(planId);
}

export function terminalTeamAssignmentForPlan(planId, roleKey, teamId = "") {
  const plan = storedTeamPlanById(planId);
  if (!plan) return null;
  const expectedTeamId = String(teamId || "").trim();
  if (expectedTeamId && expectedTeamId !== plan.teamId) return null;
  const normalizedRole = String(roleKey || "").trim().toLowerCase();
  const assignment = plan.assignments.find((item) => item.roleKey === normalizedRole);
  if (!assignment) return null;
  return Object.freeze({
    planId: plan.planId,
    planHash: plan.planHash,
    teamId: plan.teamId,
    teamSize: plan.teamSize,
    goal: plan.goal,
    plannerMode: plan.plannerMode,
    plannerModel: plan.plannerModel,
    assignment
  });
}

export function validateTerminalTeamProposal(proposal, input = {}) {
  const intent = normalizeTerminalTeamInput(input);
  return validateTerminalTeamProposalForTopology(
    proposal,
    chooseTerminalTeamTopology(intent)
  );
}

export function deterministicTerminalTeamTopology(input = {}) {
  return [...chooseTerminalTeamTopology(normalizeTerminalTeamInput(input))];
}

function acceptedProposal(proposal, topology, fallbackReason = "") {
  if (proposal == null) {
    return { proposal: null, fallbackReason: fallbackReason || "no_proposal" };
  }
  try {
    return {
      proposal: validateTerminalTeamProposalForTopology(proposal, topology),
      fallbackReason: null
    };
  } catch (error) {
    return {
      proposal: null,
      fallbackReason: ["invalid_scope", "unsupported_output"].includes(error?.code)
        ? error.code
        : "invalid_schema"
    };
  }
}
