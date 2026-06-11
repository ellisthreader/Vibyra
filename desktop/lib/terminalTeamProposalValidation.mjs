import {
  TERMINAL_TEAM_PLAN_SCHEMA_VERSION,
  alias,
  assertPlainObject,
  boundedStringArray,
  boundedText,
  plannerError,
  rejectUnknownKeys
} from "./terminalTeamPlannerShared.mjs";
import {
  assertProposalBounds,
  validateProposalIntents,
  validateProposalScope
} from "./terminalTeamProposalScope.mjs";

const ROLE_KEYS = new Set(["coordinator", "builder", "verifier", "reviewer"]);
const ARRAY_FIELDS = [
  "deliverables", "assumptions", "nonGoals", "focusAreas", "risks",
  "completionEvidence"
];
const ASSIGNMENT_KEYS = new Set([
  "roleKey", "role_key", "objective", "deliverables", "assumptions",
  "nonGoals", "non_goals", "focusAreas", "focus_areas", "inspectScope",
  "inspect_scope", "writeScope", "write_scope", "acceptanceCriteriaKeys",
  "acceptance_criteria_keys", "validationIntents", "validation_intents",
  "risks", "completionEvidence", "completion_evidence"
]);
const PROPOSAL_KEYS = new Set([
  "schemaVersion", "schema_version", "goalSummary", "goal_summary",
  "assumptions", "nonGoals", "non_goals", "assignments",
  "acceptanceCriteria", "acceptance_criteria", "openQuestions", "open_questions"
]);
const CRITERION_KEYS = new Set([
  "key", "statement", "evidenceRequired", "evidence_required"
]);
const EVIDENCE_KINDS = new Set([
  "repository_evidence", "diff", "command_result", "runtime_observation",
  "review_finding"
]);

export function validateTerminalTeamProposalForTopology(proposal, topology) {
  assertPlainObject(proposal, "Team planner proposal");
  assertProposalBounds(proposal);
  rejectUnknownKeys(proposal, PROPOSAL_KEYS, "Team planner proposal");
  const schemaVersion = alias(proposal, "schemaVersion", "schema_version");
  if (schemaVersion !== TERMINAL_TEAM_PLAN_SCHEMA_VERSION) {
    throw plannerError("Unsupported Team planner schema.", "unsupported_output");
  }
  if (!Array.isArray(proposal.assignments)
    || proposal.assignments.length !== topology.length) {
    throw plannerError("Team planner assignments do not match the selected topology.");
  }
  const criteria = validateCriteria(alias(
    proposal, "acceptanceCriteria", "acceptance_criteria"
  ) || []);
  const expected = new Set(topology);
  const seen = new Set();
  const assignments = proposal.assignments.map((assignment) =>
    validateAssignment(assignment, expected, seen, criteria));
  if (seen.size !== expected.size) {
    throw plannerError("Team planner roles do not match the selected topology.");
  }
  rejectOrphanedCriteria(criteria, assignments);
  boundedStringArray(proposal.assumptions || [], 12, "proposal assumptions");
  boundedStringArray(alias(proposal, "nonGoals", "non_goals") || [], 12,
    "proposal non-goals");
  boundedStringArray(alias(proposal, "openQuestions", "open_questions") || [], 1,
    "proposal open questions");
  const summary = alias(proposal, "goalSummary", "goal_summary");
  if (summary != null) boundedText(summary, 1200, "Invalid goal summary.");
  return { assignments, criteria };
}

function validateAssignment(value, expected, seen, criteria) {
  assertPlainObject(value, "Team assignment");
  rejectUnknownKeys(value, ASSIGNMENT_KEYS, "Team assignment");
  const roleKey = String(alias(value, "roleKey", "role_key") || "").toLowerCase();
  if (!ROLE_KEYS.has(roleKey) || !expected.has(roleKey) || seen.has(roleKey)) {
    throw plannerError("Team planner returned an invalid or duplicate role.");
  }
  seen.add(roleKey);
  const result = {
    roleKey,
    objective: boundedText(value.objective, 1200,
      "Every Team assignment needs an objective.")
  };
  for (const field of ARRAY_FIELDS) {
    const snake = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[field] = boundedStringArray(alias(value, field, snake) || [], 12, field);
  }
  result.inspectScope = validateProposalScope(
    alias(value, "inspectScope", "inspect_scope") || [], false
  );
  result.writeScope = validateProposalScope(
    alias(value, "writeScope", "write_scope") || [], roleKey !== "builder"
  );
  result.acceptanceCriteriaKeys = validateCriterionReferences(alias(
    value, "acceptanceCriteriaKeys", "acceptance_criteria_keys"
  ) || [], criteria);
  result.validationIntents = validateProposalIntents(alias(
    value, "validationIntents", "validation_intents"
  ) || []);
  return result;
}

function validateCriteria(values) {
  if (!Array.isArray(values) || values.length > 12) {
    throw plannerError("Acceptance criteria must be a bounded array.");
  }
  const seen = new Set();
  return values.map((value) => {
    assertPlainObject(value, "Acceptance criterion");
    rejectUnknownKeys(value, CRITERION_KEYS, "Acceptance criterion");
    const key = boundedKey(value.key, "criterion key");
    if (seen.has(key)) throw plannerError("Acceptance criterion keys must be unique.");
    seen.add(key);
    const evidenceRequired = alias(value, "evidenceRequired", "evidence_required");
    if (!EVIDENCE_KINDS.has(evidenceRequired)) {
      throw plannerError("Acceptance criterion evidence is invalid.");
    }
    return {
      key,
      statement: boundedText(value.statement, 1200, "Criterion statement is required."),
      evidenceRequired
    };
  });
}

function validateCriterionReferences(values, criteria) {
  if (!Array.isArray(values) || values.length > 12) {
    throw plannerError("Criterion references must be a bounded array.");
  }
  const known = new Set(criteria.map((criterion) => criterion.key));
  const seen = new Set();
  return values.map((value) => {
    const key = boundedKey(value, "criterion reference");
    if (!known.has(key) || seen.has(key)) {
      throw plannerError("Criterion references must be known and unique.");
    }
    seen.add(key);
    return key;
  });
}

function rejectOrphanedCriteria(criteria, assignments) {
  const referenced = new Set(assignments.flatMap(
    (assignment) => assignment.acceptanceCriteriaKeys
  ));
  if (criteria.some((criterion) => !referenced.has(criterion.key))) {
    throw plannerError("Every acceptance criterion must be assigned to a role.");
  }
}

function boundedKey(value, label) {
  const key = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(key)) {
    throw plannerError(`Invalid ${label}.`);
  }
  return key;
}
