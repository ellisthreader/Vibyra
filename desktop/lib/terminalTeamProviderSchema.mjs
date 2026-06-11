import { TERMINAL_TEAM_PLAN_SCHEMA_VERSION } from "./terminalTeamPlannerShared.mjs";

export function terminalTeamProviderOutputSchema(requestedRoles = []) {
  const roles = normalizeRoles(requestedRoles);
  const strings = { type: "array", items: { type: "string" }, maxItems: 12 };
  const scope = {
    type: "array",
    maxItems: 24,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "path"],
      properties: {
        kind: { type: "string", enum: ["file", "directory"] },
        path: { type: "string" }
      }
    }
  };
  const assignment = {
    type: "object",
    additionalProperties: false,
    required: [
      "role_key", "objective", "deliverables", "assumptions", "non_goals",
      "focus_areas", "inspect_scope", "write_scope", "acceptance_criteria_keys",
      "validation_intents", "risks", "completion_evidence"
    ],
    properties: {
      role_key: { type: "string", enum: roles },
      objective: { type: "string" },
      deliverables: strings,
      assumptions: strings,
      non_goals: strings,
      focus_areas: strings,
      inspect_scope: scope,
      write_scope: scope,
      acceptance_criteria_keys: strings,
      validation_intents: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "target"],
          properties: {
            kind: { type: "string", enum: ["inspect", "reproduce", "test", "lint", "typecheck", "build"] },
            target: { type: "string" }
          }
        }
      },
      risks: strings,
      completion_evidence: strings
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version", "goal_summary", "assumptions", "non_goals",
      "assignments", "acceptance_criteria", "open_questions"
    ],
    properties: {
      schema_version: { type: "string", enum: [TERMINAL_TEAM_PLAN_SCHEMA_VERSION] },
      goal_summary: { type: "string" },
      assumptions: strings,
      non_goals: strings,
      assignments: {
        type: "array",
        minItems: roles.length,
        maxItems: roles.length,
        items: assignment
      },
      acceptance_criteria: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "statement", "evidence_required"],
          properties: {
            key: { type: "string" },
            statement: { type: "string" },
            evidence_required: {
              type: "string",
              enum: [
                "repository_evidence", "diff", "command_result",
                "runtime_observation", "review_finding"
              ]
            }
          }
        }
      },
      open_questions: { type: "array", items: { type: "string" }, maxItems: 1 }
    }
  };
}

function normalizeRoles(value) {
  const allowed = new Set(["coordinator", "builder", "verifier", "reviewer"]);
  const roles = Array.isArray(value)
    ? value.map((role) => String(role || "").trim().toLowerCase())
      .filter((role, index, items) => allowed.has(role) && items.indexOf(role) === index)
    : [];
  return roles.length >= 2 && roles.length <= 4
    ? roles
    : ["coordinator", "builder", "verifier", "reviewer"];
}
