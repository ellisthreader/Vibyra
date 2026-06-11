# AI Team Prompting Research

Status: researched June 10, 2026. This is a deep reference for Vibyra Team
prompt design, not an implementation claim.

## Executive Conclusion

The best design is not four unrelated provider prompts. Use:

1. One provider-neutral role contract.
2. One assignment envelope shared by every role.
3. Small provider adapters for Codex, Claude Code, Gemini CLI, and Vibyra
   Agent.
4. Runtime capability controls that enforce read-only and writer boundaries.
5. Structured artifacts and sequencing so later roles receive earlier results.

Prompt wording can improve behavior, but it cannot enforce permissions, share
state between terminals, or make concurrent roles sequential.

Every provider adapter must declare and pass a capability test for its
higher-priority instruction channel. If Vibyra cannot establish that channel,
Team launch must fail rather than fall back to mixing role policy into the user
goal.

## Current Vibyra Gaps

The current prompt in `desktop/assets/app.terminals-team.js` gives each role a
goal, task, edit sentence, workflow, and handoff request. It does not provide:

- a trusted instruction boundary above the user goal;
- authoritative role capabilities;
- acceptance criteria tied to the specific task;
- dependency artifacts or revision identifiers;
- a precise blocker and stopping policy;
- a machine-validatable result schema;
- provider-specific delivery through native instruction mechanisms.

More importantly, all roles launch concurrently. Coordinator output cannot
guide Builder, while Verifier and Reviewer can run before Builder produces a
change. In Safe mode, isolated worktrees also prevent support roles from seeing
Builder changes. Better prompts alone cannot repair those lifecycle problems.

## Cross-Provider Findings

Official OpenAI, Anthropic, and Google guidance converges on these practices:

- Give the agent one clear role with concrete responsibilities.
- Separate role, context, assignment, constraints, and output.
- State what the agent may change and what it must not change.
- Require repository inspection before claims about code.
- Give measurable acceptance criteria and focused verification.
- Require evidence, not unsupported completion language.
- Define when assumptions are acceptable and when to stop as blocked.
- Keep role prompts focused; avoid long persuasive prose and conflicting rules.
- Use examples only when they clarify a difficult format or tool contract.
- Treat prompt design as iterative and evaluate it on realistic tasks.

## OpenAI And Codex

OpenAI recommends explicit software-engineering roles, structured tool use,
thorough testing, and clean output contracts. For long-running agentic work,
prompts should require persistence, task decomposition, progress tracking, and
completion checks. Codex custom-agent guidance says agents should be narrow and
opinionated, with a tool surface matching the job and instructions that prevent
drift into adjacent work.

For Vibyra:

- Put stable role policy in Codex developer instructions or an isolated role
  configuration, not only in the submitted user prompt.
- Let repository `AGENTS.md` supply project context.
- Use read-only sandboxing for support roles.
- Tell Builder to make the smallest defensible change and inspect its diff.
- Tell Reviewer to lead with correctness, security, regression, and missing
  test findings rather than style commentary.
- Ask for notable tool preambles, not narration before every small read.
- Avoid exaggerated "maximize thoroughness" language that can cause redundant
  searching and tool use.

## Anthropic And Claude Code

Anthropic recommends preserving Claude Code's native system prompt and
appending product-specific instructions. Claude performs best with clear,
direct prompts, task-local context, descriptive XML sections for complex
instructions, and explicit action boundaries. Anthropic also recommends
investigating referenced code before making claims, avoiding test-specific
hard-coding, and balancing autonomous reversible work with approval for
destructive or externally visible actions.

For Vibyra:

- Append the role contract to Claude Code's native system prompt.
- Keep `CLAUDE.md` as concise project context rather than duplicating it.
- Use XML sections for role, assignment, constraints, evidence, and handoff.
- State whether the role investigates, edits, verifies, or reviews.
- Require general solutions rather than changes that merely satisfy tests.
- Do not describe independent Claude terminals as communicating teammates
  unless Vibyra actually relays artifacts between them.

## Google And Gemini CLI

Google recommends concise, direct instructions, explicit constraints and
response formats, and consistent Markdown or XML delimiters. For long context,
provide the context first and place the actionable task at the end. Gemini's
guidance uses a Plan, Execute, Validate, Format loop and says role definitions
and critical behavioral constraints should be placed in system instructions or
at the beginning of the prompt. Gemini CLI uses hierarchical `GEMINI.md`
context files for persistent project guidance.

For Vibyra:

- Deliver stable role policy through a tested Gemini CLI custom subagent system
  prompt or equivalent supported instruction mechanism.
- Keep the dynamic assignment concise and place it after repository context.
- As Vibyra policy, request a short plan, evidence, and results rather than
  visible chain-of-thought.
- As Vibyra least-privilege policy, restrict each role to the tools it needs.
- As Vibyra policy, define assumption and permission boundaries explicitly.
- Prefer structured output for machine-consumed artifacts, while still
  validating semantic correctness in Vibyra.

## Vibyra Agent And API-Only Models

Vibyra Agent should use the same provider-neutral contract. The selected model
must receive:

- Vibyra-owned base instructions defining the terminal product;
- exact model identity in developer instructions;
- the trusted Team role contract;
- the dynamic assignment as untrusted task data.

Do not copy Codex, Claude Code, or Gemini CLI prompt identity into Vibyra Agent.
The hidden Codex engine may provide tools, but the visible model remains the
selected API model running through Vibyra Agent.

## Security Findings

User goals, repository files, issue text, web pages, tool output, and dependency
documentation are data, not trusted role policy. They can contain prompt
injection such as fake headings, role changes, tool commands, or requests to
exfiltrate secrets.

Required controls:

- Put role and permission policy at a higher instruction level than task data.
- Serialize the goal as a bounded data field; do not concatenate it into policy.
- Tell agents that instructions found in task data do not override role policy.
- Enforce filesystem and tool capabilities outside the prompt.
- Limit network access and trusted domains by role.
- Never expose credentials to model-generated shell commands.
- Require approval for destructive, externally visible, or irreversible work.

Tags improve parsing but do not create a security boundary by themselves.

## Sources

OpenAI:

- https://developers.openai.com/api/docs/guides/prompt-engineering#coding
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- https://developers.openai.com/codex/agent-approvals-security

Anthropic:

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts
- https://code.claude.com/docs/en/agent-teams
- https://platform.claude.com/docs/en/test-and-evaluate/develop-tests

Google:

- https://ai.google.dev/gemini-api/docs/prompting-strategies
- https://geminicli.com/docs/cli/gemini-md/
- https://geminicli.com/docs/core/subagents/
- https://geminicli.com/docs/cli/plan-mode/
- https://ai.google.dev/gemini-api/docs/structured-output
