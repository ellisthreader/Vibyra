export const TERMINAL_TASK_ROLES = [
  role(
    "Reproduction and evidence lead",
    "Reproduce the reported behavior, collect concrete evidence, and trace the first failing boundary.",
    "Read-only investigation. Do not edit source or tests.",
    "A minimal reproduction, observed-versus-expected behavior, and exact file or runtime boundaries for the fix owner."
  ),
  role(
    "Regression-test and verification lead",
    "Find the closest automated coverage, create a focused failing regression when useful, and verify the repaired behavior.",
    "Own focused test files and fixtures only. Do not modify production code.",
    "A regression that fails for the confirmed defect and the exact checks needed to prove the fix."
  ),
  role(
    "Root-cause and implementation lead",
    "Map the relevant code path end to end, identify the root cause, and implement the smallest complete fix.",
    "Own the primary production-code fix. Use evidence and tests already present in the worktree.",
    "A scoped implementation that fixes the confirmed cause, preserves existing behavior, and passes focused validation."
  ),
  role(
    "State and lifecycle specialist",
    "Audit state ownership, async ordering, persistence, recovery, and cleanup related to the objective.",
    "Own only state, lifecycle, persistence, or recovery modules outside another agent's active edits.",
    "Confirmed lifecycle defects, a scoped fix where allowed, and coverage for stale, recovery, and cleanup states."
  ),
  role(
    "Error-handling and resilience specialist",
    "Inspect failure paths, user-visible errors, retries, and recovery behavior, then fix confirmed weaknesses.",
    "Own only error and recovery paths not already being changed by another agent.",
    "Failure-path evidence, actionable user-facing behavior, and focused recovery validation."
  ),
  role(
    "Security and permission reviewer",
    "Audit trust boundaries, permission escalation, input handling, and destructive behavior without broadening access.",
    "Prefer read-only review. Change validation or permission code only for a confirmed vulnerability with focused tests.",
    "Evidence-backed security findings, exploit or misuse conditions, and the narrowest safe remediation."
  ),
  role(
    "Frontend behavior and accessibility specialist",
    "Inspect rendering, interaction, responsive behavior, keyboard use, accessibility, and visual consistency.",
    "Own objective-related UI, styling, and accessibility files only.",
    "A polished implementation or precise findings covering relevant states, responsive layout, keyboard behavior, and accessibility."
  ),
  role(
    "Concurrency and performance specialist",
    "Look for races, duplicate work, stale state, blocking operations, leaks, and measurable performance regressions.",
    "Own concurrency or performance fixes only when supported by a reproducible failure or measurement.",
    "A reproducible concurrency or performance finding, before-and-after evidence, and focused validation."
  ),
  role(
    "Integration-boundary specialist",
    "Verify contracts between UI, bridge, routes, processes, providers, and storage, and repair confirmed mismatches.",
    "Own one confirmed integration boundary and its contract tests; avoid broad cross-module rewrites.",
    "The broken contract, both sides of the boundary, and an end-to-end check proving compatibility."
  ),
  role(
    "Architecture and maintainability reviewer",
    "Check module ownership and coupling around the issue, making only structural changes required for correctness.",
    "Read-only unless a small structural change is required and does not overlap another agent.",
    "Concrete architectural risks, file ownership guidance, and only the minimal correctness-driven refactor."
  ),
  role(
    "Adversarial regression reviewer",
    "Challenge the behavior with edge cases and negative tests, and fix any newly confirmed uncovered defect.",
    "Own negative and edge-case tests; change production code only for a newly confirmed defect.",
    "Edge cases attempted, regressions found, and negative coverage that prevents recurrence."
  ),
  role(
    "Final validation and synthesis lead",
    "Run the highest-value validation, inspect the combined behavior, and identify unresolved risks with evidence.",
    "Read-only final review. Do not rewrite other agents' work.",
    "A pass/fail verdict against the objective, commands run, observed behavior, and precise remaining follow-ups."
  )
];

function role(name, scope, editPolicy, deliverable) {
  return { role: name, scope, editPolicy, deliverable };
}
