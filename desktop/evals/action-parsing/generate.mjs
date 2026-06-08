import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_PATH = fileURLToPath(new URL("./cases.jsonl", import.meta.url));
const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve"
];

export function buildDesktopActionDataset() {
  const cases = [];
  const seen = new Set();
  const add = (record) => {
    const promptKey = normalizePrompt(record.prompt);
    if (seen.has(promptKey)) return;
    seen.add(promptKey);
    cases.push({ version: 1, tier: "must_pass", ...record });
  };

  addOpenMatrix(add);
  addWordCountMatrix(add);
  addProjectCases(add);
  addFullPcCases(add);
  addImplicitModelCases(add);
  addTerminalTaskCases(add);
  addCloseCases(add);
  addPermissionCases(add);
  addCompanionCases(add);
  addNegativeCases(add);
  addTypoCases(add);
  return cases;
}

function addOpenMatrix(add) {
  const verbs = ["open", "launch", "start", "create", "spawn", "run"];
  const models = [
    ["GPT-5.5", "gpt-5.5"],
    ["gpt5.5", "gpt-5.5"],
    ["GPT 5.5", "gpt-5.5"],
    ["5.5 GPT", "gpt-5.5"],
    ["GPT-5.5 Pro", "openai/gpt-5.5-pro"],
    ["5.5 GPT Pro", "openai/gpt-5.5-pro"],
    ["Codex", "gpt-5-codex"],
    ["Claude", "claude-sonnet-4"],
    ["Gemini", "gemini-2.5-pro"]
  ];
  const nouns = ["terminal", "terminals", "AI terminals"];
  const efforts = [
    ["", "medium"],
    [" fast", "low"],
    [" with high effort", "high"],
    [" with maximum reasoning", "xhigh"]
  ];
  const permissions = [
    ["", "standard"],
    [" with full access", "full"]
  ];

  for (const verb of verbs) {
    for (let count = 1; count <= 12; count += 1) {
      for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
        const [modelText, model] = models[modelIndex];
        for (let nounIndex = 0; nounIndex < nouns.length; nounIndex += 1) {
          const noun = nouns[nounIndex];
          for (let effortIndex = 0; effortIndex < efforts.length; effortIndex += 1) {
            const [effortText, effort] = efforts[effortIndex];
            for (let permissionIndex = 0; permissionIndex < permissions.length; permissionIndex += 1) {
              const [permissionText, permissionMode] = permissions[permissionIndex];
              const prompt = `${verb} ${count} ${modelText} ${noun}${effortText}${permissionText}`;
              add(actionCase(
                `open.numeric.${verb}.${count}.m${modelIndex}.n${nounIndex}.e${effortIndex}.p${permissionIndex}`,
                prompt,
                openAction({ count, model, effort, permissionMode })
              ));
            }
          }
        }
      }
    }
  }
}

function addWordCountMatrix(add) {
  const models = [
    ["GPT-5.5", "gpt-5.5"],
    ["GPT-5.5 Pro", "openai/gpt-5.5-pro"],
    ["Claude", "claude-sonnet-4"],
    ["Gemini", "gemini-2.5-pro"]
  ];
  for (let index = 0; index < NUMBER_WORDS.length; index += 1) {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const [modelText, model] = models[modelIndex];
      for (let nounIndex = 0; nounIndex < 2; nounIndex += 1) {
        const noun = ["terminal", "AI terminals"][nounIndex];
        add(actionCase(
          `open.word.${NUMBER_WORDS[index]}.m${modelIndex}.n${nounIndex}`,
          `Open ${NUMBER_WORDS[index]} ${modelText} ${noun}`,
          openAction({ count: index + 1, model })
        ));
      }
    }
  }
}

function addProjectCases(add) {
  const references = [
    ["SaaS", "SaaS"],
    ["saas", "saas"],
    ["Desktop/SaaS", "Desktop/SaaS"],
    ["My SaaS App", "My SaaS App"]
  ];
  const templates = [
    (reference) => `Open 5 GPT-5.5 terminals on project ${reference}`,
    (reference) => `Open 5 GPT-5.5 terminals in the project ${reference}`,
    (reference) => `Open 5 GPT-5.5 terminals for my project ${reference}`,
    (reference) => `Open 5 GPT-5.5 terminals with the project ${reference} on my desktop`
  ];
  for (const [reference, expected] of references) {
    for (let index = 0; index < templates.length; index += 1) {
      add(actionCase(
        `project.${slug(reference)}.${index}`,
        templates[index](reference),
        openAction({ count: 5, model: "gpt-5.5", projectId: "", projectName: expected })
      ));
    }
  }
  add(actionCase(
    "project.quoted.multiword",
    'Launch two Codex terminals in project "My SaaS App"',
    openAction({ count: 2, model: "gpt-5-codex", projectId: "", projectName: "My SaaS App" })
  ));
}

function addFullPcCases(add) {
  for (const phrase of ["full PC", "whole PC", "whole computer", "entire PC", "entire computer", "home directory"]) {
    add(actionCase(
      `scope.full-pc.${slug(phrase)}`,
      `Open two GPT-5.5 terminals on my ${phrase}`,
      openAction({ count: 2, model: "gpt-5.5", projectId: "full-pc" })
    ));
  }
}

function addImplicitModelCases(add) {
  const examples = [
    ["open ai 5.5", "gpt-5.5"],
    ["launch GPT-5.5", "gpt-5.5"],
    ["start gpt5.5 pro", "openai/gpt-5.5-pro"],
    ["open Codex", "gpt-5-codex"],
    ["open Claude", "claude-sonnet-4"],
    ["open Gemini", "gemini-2.5-pro"]
  ];
  for (const [prompt, model] of examples) {
    add(actionCase(`implicit.${slug(prompt)}`, prompt, openAction({ model })));
  }
}

function addTerminalTaskCases(add) {
  addBroadTerminalTaskCases(add);
  addExplicitTerminalTaskCases(add);
}

function addBroadTerminalTaskCases(add) {
  const prefixes = [
    "Run tasks in each terminal to",
    "Assign tasks across terminals to",
    "Delegate tasks across multiple terminals to",
    "Distribute tasks across the terminals to"
  ];
  const goals = [
    "find errors on the terminal page",
    "audit the authentication flow for errors",
    "look for runtime errors in desktop terminal actions",
    "review the app for bugs and failing tests",
    "audit API error handling",
    "find regressions in terminal session recovery",
    "check project routing for edge-case errors",
    "audit permission handling for unsafe behavior"
  ];
  for (let prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
    for (let goalIndex = 0; goalIndex < goals.length; goalIndex += 1) {
      const goal = goals[goalIndex];
      add(actionCase(
        `tasks.broad.p${prefixIndex}.g${goalIndex}`,
        `${prefixes[prefixIndex]} ${goal}`,
        terminalTasksAction(
          broadTerminalTasks(goal, prefixIndex === 0 ? 12 : 3),
          prefixIndex === 0 ? { target: "existing" } : {}
        )
      ));
    }
  }
  add(actionCase(
    "tasks.reported.four-terminal-subagents-typo",
    "can you run in the 4 terminals subagents to find bugs on the tereminal page",
    terminalTasksAction([
      "Inspect the terminal page for errors",
      "Run focused tests for the terminal page",
      "Review relevant code paths for the terminal page",
      "Reproduce user-facing failures in the terminal page"
    ])
  ));
  add(actionCase(
    "tasks.reported.assign-five-existing-jobs",
    "perfect! now assign all 5 terminals jobs to fix terminal page by diagonsing errors",
    terminalTasksAction([
      "Investigate: fix terminal page by diagnosing errors",
      "Run focused tests for: fix terminal page by diagnosing errors",
      "Review relevant code paths for: fix terminal page by diagnosing errors",
      "Reproduce failures for: fix terminal page by diagnosing errors",
      "Audit state and lifecycle handling for: fix terminal page by diagnosing errors"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.assign-jobs-to-each-terminal",
    "try again and assign jobs to each terminal pls to find errors on terminal page",
    terminalTasksAction(broadTerminalTasks("find errors on terminal page", 12), { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.give-three-of-seven-existing-terminals-jobs",
    "now with the 7 terminals you just opened can you give 3 of them the job to find and diagonse errors on the terminal page on vibyra desktop app",
    terminalTasksAction([
      "Inspect the terminal page on vibyra desktop app for errors",
      "Run focused tests for the terminal page on vibyra desktop app",
      "Review relevant code paths for the terminal page on vibyra desktop app"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.assign-three-terminals-already-open",
    "with the terminals open now assign 3 terminals to find frontend fixes to terminal picker",
    terminalTasksAction([
      "Investigate: find frontend fixes to terminal picker",
      "Run focused tests for: find frontend fixes to terminal picker",
      "Review relevant code paths for: find frontend fixes to terminal picker"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.assign-two-of-four-open-terminals",
    "the 4 terminals open assign 2 of them to do frontend auidt of terminal page",
    terminalTasksAction([
      "Investigate: do frontend audit of terminal page",
      "Run focused tests for: do frontend audit of terminal page"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.assign-three-newly-opened-read-only-audit",
    "Assign three of the new terminals you just opened to do a front-end audit of the terminal page. Do not change any code, just find problems.",
    terminalTasksAction([
      "Investigate: do a front-end audit of the terminal page",
      "Run focused tests for: do a front-end audit of the terminal page",
      "Review relevant code paths for: do a front-end audit of the terminal page"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.assign-three-terminals-have-just-opened-read-only",
    "Now, I want you to assign three of the terminals you have just opened to do a front-end diagnosis of the terminal page without changing any code, just let me know what needs changing.",
    terminalTasksAction([
      "Investigate: do a front-end diagnosis of the terminal page",
      "Run focused tests for: do a front-end diagnosis of the terminal page",
      "Review relevant code paths for: do a front-end diagnosis of the terminal page"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.use-three-launched-frontend-order",
    "I want you to use three of them terminals you have just launched, front a front-end order of the terminal page.",
    terminalTasksAction([
      "Investigate: a front-end audit of the terminal page",
      "Run focused tests for: a front-end audit of the terminal page",
      "Review relevant code paths for: a front-end audit of the terminal page"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.pronoun.use-three-open-terminals",
    "Use three of those open terminals for a frontend audit.",
    terminalTasksAction([
      "Investigate: a frontend audit",
      "Run focused tests for: a frontend audit",
      "Review relevant code paths for: a frontend audit"
    ], { target: "existing" })
  ));
  add(actionCase(
    "tasks.reported.eight-subagent-follow-up",
    "still not working assign 8 subagents to diagonse and fix pls",
    terminalTasksAction(
      broadTerminalTasks("find errors on terminal page", 8),
      { target: "existing" }
    ),
    {
      projectId: "project-current",
      history: [{
        role: "user",
        text: "try again and assign jobs to each terminal pls to find errors on terminal page"
      }]
    }
  ));
  add(actionCase(
    "tasks.recent-batch.ambiguous-follow-up",
    "Assign three terminals to audit the terminal page.",
    terminalTasksAction([
      "Investigate: audit the terminal page",
      "Run focused tests for: audit the terminal page",
      "Review relevant code paths for: audit the terminal page"
    ], {
      target: "existing",
      projectId: "project-recent",
      terminalIds: ["terminal-8", "terminal-9", "terminal-10"]
    }),
    {
      projectId: "",
      desktopActionContext: {
        recentTerminalBatch: {
          batchId: "batch-7",
          projectId: "project-recent",
          terminalIds: ["terminal-8", "terminal-9", "terminal-10"]
        }
      }
    }
  ));
  add(actionCase(
    "tasks.recent-batch.task-before-terminals",
    "Run a frontend audit on the terminals you opened.",
    terminalTasksAction([
      "Investigate: a frontend audit",
      "Run focused tests for: a frontend audit",
      "Review relevant code paths for: a frontend audit"
    ], {
      target: "existing",
      projectId: "project-recent",
      terminalIds: ["terminal-8", "terminal-9", "terminal-10"]
    }),
    {
      projectId: "",
      desktopActionContext: {
        recentTerminalBatch: {
          batchId: "batch-7",
          projectId: "project-recent",
          terminalIds: ["terminal-8", "terminal-9", "terminal-10"]
        }
      }
    }
  ));
  add(actionCase(
    "tasks.explicit.allow-more-if-needed",
    "Assign 3 terminals to audit the terminal page and open more terminals if needed.",
    terminalTasksAction([
      "Investigate: audit the terminal page",
      "Run focused tests for: audit the terminal page",
      "Review relevant code paths for: audit the terminal page"
    ], { target: "existing_then_new" })
  ));
}

function broadTerminalTasks(goal, count = 3) {
  const errorSearch = goal.match(/^find (?:errors|bugs|issues) (?:on|in|for) (.+)$/i);
  if (errorSearch) {
    const subject = errorSearch[1];
    return [
      `Inspect ${subject} for errors`,
      `Run focused tests for ${subject}`,
      `Review relevant code paths for ${subject}`,
      `Reproduce user-facing failures in ${subject}`,
      `Audit state and lifecycle handling for ${subject}`,
      `Check error handling and recovery for ${subject}`,
      `Review permission boundaries for ${subject}`,
      `Check responsive and accessibility behavior for ${subject}`,
      `Review race conditions and performance risks for ${subject}`,
      `Inspect integration boundaries for ${subject}`,
      `Validate regression coverage for ${subject}`,
      `Summarize confirmed bugs and recommended fixes for ${subject}`
    ].slice(0, count);
  }
  return [
    `Investigate: ${goal}`,
    `Run focused tests for: ${goal}`,
    `Review relevant code paths for: ${goal}`,
    `Reproduce failures for: ${goal}`,
    `Audit state and lifecycle handling for: ${goal}`,
    `Check error handling and recovery for: ${goal}`,
    `Review permission boundaries for: ${goal}`,
    `Check responsive and accessibility behavior for: ${goal}`,
    `Review race conditions and performance risks for: ${goal}`,
    `Inspect integration boundaries for: ${goal}`,
    `Validate regression coverage for: ${goal}`,
    `Summarize confirmed bugs and recommended fixes for: ${goal}`
  ].slice(0, count);
}

function addExplicitTerminalTaskCases(add) {
  const examples = [
    {
      id: "tasks.explicit.numbered.settings",
      prompt: [
        "Assign these different tasks across terminals using GPT-5.5 with high effort and full access:",
        "1. Check the terminal page for runtime errors.",
        "2. Run the focused terminal tests.",
        "3. Review terminal state cleanup."
      ].join("\n"),
      tasks: [
        "Check the terminal page for runtime errors",
        "Run the focused terminal tests",
        "Review terminal state cleanup"
      ],
      settings: { model: "gpt-5.5", effort: "high", permissionMode: "full" }
    },
    {
      id: "tasks.explicit.bullets.project",
      prompt: [
        'Delegate separate terminal tasks in project "My SaaS App":',
        "- Inspect the terminal renderer.",
        "- Verify the terminal action tests."
      ].join("\n"),
      tasks: ["Inspect the terminal renderer", "Verify the terminal action tests"],
      settings: { projectId: "", projectName: "My SaaS App" }
    },
    {
      id: "tasks.explicit.inline",
      prompt: "Distribute different tasks across terminals: 1) Audit the API error paths. 2) Run the API tests. 3) Review the fixes.",
      tasks: ["Audit the API error paths", "Run the API tests", "Review the fixes"]
    },
    {
      id: "tasks.explicit.each-terminal",
      prompt: [
        "Assign each terminal a different task:",
        "* Audit login error handling.",
        "* Check signup validation.",
        "* Run the authentication tests."
      ].join("\n"),
      tasks: ["Audit login error handling", "Check signup validation", "Run the authentication tests"],
      settings: { target: "existing" }
    },
    {
      id: "tasks.explicit.full-pc",
      prompt: [
        "Run these different tasks across terminals on my full PC:",
        "1. Find broken workspace configurations.",
        "2. Audit desktop startup errors."
      ].join("\n"),
      tasks: ["Find broken workspace configurations", "Audit desktop startup errors"],
      settings: { projectId: "full-pc" }
    },
    {
      id: "tasks.explicit.fast-codex",
      prompt: [
        "Delegate separate terminal tasks using Codex in fast mode:",
        "+ Inspect the changed files.",
        "+ Run focused tests.",
        "+ Summarize remaining risks."
      ].join("\n"),
      tasks: ["Inspect the changed files", "Run focused tests", "Summarize remaining risks"],
      settings: { model: "gpt-5-codex", effort: "low" }
    }
  ];

  for (const example of examples) {
    add(actionCase(
      example.id,
      example.prompt,
      terminalTasksAction(example.tasks, example.settings)
    ));
  }
}

function addCloseCases(add) {
  for (const verb of ["close", "stop", "end", "remove", "quit"]) {
    add(actionCase(
      `close.active.${verb}`,
      `${verb} this terminal`,
      { type: "close_terminals", scope: "active", terminalId: "terminal-current" },
      { terminalId: "terminal-current" }
    ));
    add(actionCase(
      `close.all.${verb}`,
      `${verb} all terminals`,
      { type: "close_terminals", scope: "all", terminalId: "" }
    ));
  }
}

function addPermissionCases(add) {
  const allPrompts = [
    "Give all terminals full permissions",
    "Grant every terminal full access",
    "Set these terminals to full permissions",
    "perfect thanks can you also give all 4 of the terminals full permissions pls"
  ];
  for (let index = 0; index < allPrompts.length; index += 1) {
    add(actionCase(
      `permissions.all.${index}`,
      allPrompts[index],
      { type: "set_terminal_permissions", scope: "all", permissionMode: "full", terminalId: "" },
      { terminalId: "terminal-current" }
    ));
  }
  add(actionCase(
    "permissions.active",
    "Give this terminal full access",
    { type: "set_terminal_permissions", scope: "active", permissionMode: "full", terminalId: "terminal-current" },
    { terminalId: "terminal-current" }
  ));
}

function addCompanionCases(add) {
  const examples = [
    ["/voice", "voice"],
    ["Open Vibyra Voice", "voice"],
    ["Show Vibyra Voice", "voice"],
    ["/memory", "memory"],
    ["/memories", "memory"],
    ["Show project memory", "memory"]
  ];
  for (const [prompt, mode] of examples) {
    add(actionCase(
      `companion.${mode}.${slug(prompt)}`,
      prompt,
      { type: "open_terminal_companion", mode }
    ));
  }
}

function addNegativeCases(add) {
  const examples = [
    "Don't open any terminals",
    "Do not launch five terminals",
    "Never start a terminal",
    "Explain how to open 5 terminals",
    "Describe how GPT-5.5 terminals work",
    "Tell me how to close all terminals",
    "How do I open a terminal?",
    "How can I close every terminal?",
    "What happens if I open GPT-5.5 terminals?",
    "Why would I use a terminal?",
    "Explain terminal permissions",
    "Compare GPT-5.5 and Claude",
    "Write an example prompt that says open 5 terminals",
    "The terminal closes when the process exits",
    "I opened five terminals yesterday",
    "Do not close all terminals",
    "Never remove this terminal",
    "Don't assign tasks across terminals to audit errors",
    "Do not delegate tasks to separate terminals to find bugs",
    "Never distribute tasks across multiple terminals to review failures",
    "Don't run tasks in each terminal to find errors",
    "Don't give the terminals full permissions",
    "Explain how to assign different tasks across terminals",
    "How do I delegate tasks to separate terminals?",
    "Describe running an error audit across multiple terminals",
    "Write an example task list for separate terminals",
    "I assigned different tasks across terminals yesterday",
    "The team runs tasks across multiple terminals",
    "How do I show project memory?",
    "Explain Vibyra Voice",
    "Open the terminal documentation",
    "Can you explain why we assign 8 subagents to find bugs?",
    "We assign 8 subagents to find bugs during audits",
    "Should we assign 8 subagents to find bugs?",
    "If I assign tasks across terminals to audit errors, what happens?",
    "Add a button labeled \"Assign tasks across terminals to find bugs\"",
    "Give this terminal no full access",
    "Anything except full access for this terminal",
    "Stop talking about terminals",
    "Close terminals after tests finish",
    "Explain how to give 3 of the terminals a job",
    "Do not give 3 of the terminals jobs",
    "Give me 3 examples of terminal jobs",
    "Should I give 3 of the terminals the job to audit errors?",
    "When tests finish, give 3 of the terminals the job to audit errors",
    "Give 3 of the 7 terminals full permissions"
  ];
  for (const prompt of examples) {
    add({
      id: `negative.${slug(prompt)}`,
      category: "no_action",
      prompt,
      context: {},
      expected: { kind: "no_action" },
      tags: ["negative"]
    });
  }
}

function addTypoCases(add) {
  const examples = [
    ["open 5 GPT-5.5 termianls", 5, "gpt-5.5", "project-current", ""],
    ["launch two GPT-5.5 teminals", 2, "gpt-5.5", "project-current", ""],
    ["start 3 Claude termnals", 3, "claude-sonnet-4", "project-current", ""],
    ["open 5 GPT-5.5 terminals with the projet SaaS on my desltpo", 5, "gpt-5.5", "", "SaaS"]
  ];
  for (const [prompt, count, model, projectId, projectName] of examples) {
    add(actionCase(
      `typo.${slug(prompt)}`,
      prompt,
      openAction({ count, model, projectId, ...(projectName ? { projectName } : {}) })
    ));
  }
}

function actionCase(id, prompt, action, context = { projectId: "project-current" }) {
  return {
    id,
    category: action.type,
    prompt,
    context,
    expected: { kind: "action", action },
    tags: [action.type]
  };
}

function openAction({
  count = 1,
  model = "auto",
  effort = "medium",
  permissionMode = "standard",
  projectId = "project-current",
  projectName
} = {}) {
  return {
    type: "open_terminals",
    count,
    model,
    effort,
    permissionMode,
    projectId,
    ...(projectName ? { projectName } : {})
  };
}

function terminalTasksAction(taskTexts, {
  model = "auto",
  effort = "medium",
  permissionMode = "standard",
  projectId = "project-current",
  projectName,
  target = "new",
  terminalIds
} = {}) {
  return {
    type: "run_terminal_tasks",
    target,
    ...(Array.isArray(terminalIds) && terminalIds.length ? { terminalIds } : {}),
    model,
    effort,
    permissionMode,
    projectId,
    ...(projectName ? { projectName } : {}),
    tasks: taskTexts.map((task) => ({ task }))
  };
}

function normalizePrompt(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function slug(value) {
  return normalizePrompt(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function writeDataset() {
  const cases = buildDesktopActionDataset();
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`);
  process.stdout.write(`Wrote ${cases.length} desktop action examples to ${OUTPUT_PATH}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeDataset();
