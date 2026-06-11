import { terminalTeamRoleDefinition } from "./terminalTeamPromptRoles.mjs";
import { hashCanonical } from "./terminalTeamPlannerShared.mjs";

export function assignmentsFromProposal(proposal, topology, goal) {
  const criterionByKey = new Map(proposal.criteria.map((criterion) =>
    [criterion.key, criterion]));
  return topology.map((roleKey, index) => {
    const source = proposal.assignments.find((item) => item.roleKey === roleKey);
    return finalizeAssignment({
      ...source,
      acceptanceCriteria: source.acceptanceCriteriaKeys.map(
        (key) => criterionByKey.get(key)
      )
    }, topology, index, goal);
  });
}

export function deterministicAssignments(goal, topology) {
  const objectives = {
    coordinator: "Map the relevant code path, constraints, risks, and a scoped implementation approach.",
    builder: "Implement the smallest complete change that satisfies the shared goal and verify the result.",
    verifier: "Run the strongest non-destructive checks available and report observed evidence.",
    reviewer: "Review the visible implementation for correctness, security, regressions, and missing tests."
  };
  return topology.map((roleKey, index) => finalizeAssignment({
    roleKey,
    objective: objectives[roleKey],
    deliverables: roleKey === "builder"
      ? ["A focused implementation and verification report."]
      : [],
    assumptions: [],
    nonGoals: ["Do not expand beyond the shared goal."],
    focusAreas: [goal],
    inspectScope: [],
    writeScope: [],
    acceptanceCriteria: [],
    validationIntents: [],
    risks: [],
    completionEvidence: []
  }, topology, index, goal));
}

function finalizeAssignment(source, topology, index, goal) {
  const role = terminalTeamRoleDefinition(source.roleKey);
  const dependencies = index > 0 && source.roleKey !== "reviewer"
    ? [topology[index - 1]]
    : source.roleKey === "reviewer" && topology.includes("builder")
      ? ["builder"]
      : [];
  const data = {
    roleKey: source.roleKey,
    title: role.title,
    phase: role.phase,
    capability: role.capability,
    objective: source.objective,
    deliverables: source.deliverables,
    assumptions: source.assumptions,
    nonGoals: source.nonGoals,
    focusAreas: source.focusAreas,
    inspectScope: source.inspectScope,
    writeScope: source.writeScope,
    acceptanceCriteria: source.acceptanceCriteria,
    validationIntents: source.validationIntents,
    risks: source.risks,
    completionEvidence: source.completionEvidence,
    dependencies
  };
  const assignmentHash = hashCanonical({ goal, ...data });
  return {
    assignmentId: `assignment-${assignmentHash.slice(0, 20)}`,
    assignmentHash,
    ...data
  };
}
