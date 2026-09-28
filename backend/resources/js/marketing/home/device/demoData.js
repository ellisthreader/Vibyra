// Sample content for the homepage device. Illustrative only - never presented
// as a live agent run. The shapes mirror what the desktop app shows.

// desktop-tauri/src/lib/projectIdentity.ts cycles this palette by index.
export const tileColors = ["#5b7cfa", "#ff9b6a", "#37c78a", "#bd8cff", "#6aa8ff", "#e8a94b"];

export const providers = {
    claude: { name: "Claude Code", company: "Anthropic", command: "claude" },
    codex: { name: "Codex", company: "OpenAI", command: "codex" },
    gemini: { name: "Gemini CLI", company: "Google", command: "gemini" },
    terminal: { name: "Terminal", company: "Local shell", command: "zsh" },
};

const orbitSessions = [
    {
        id: "s1",
        label: "Claude Code",
        agent: "claude",
        state: "working",
        lines: [
            ["prompt", "❯ Build a calm habit tracker."],
            ["tool", "⏺ Read 3 files"],
            ["output", "⎿  HabitCard.tsx · TodayView.tsx"],
            ["tool", "⏺ Update(HabitCard.tsx)"],
            ["output", "⎿  Added the daily progress card"],
            ["tool", "⏺ Update(TodayView.tsx)"],
            ["thinking", "✳ Polishing the empty state…"],
        ],
    },
    {
        id: "s2",
        label: "Codex",
        agent: "codex",
        state: "idle",
        lines: [
            ["prompt", "› Review habit state edge cases."],
            ["tool", "• Explored daily reset and streak logic"],
            ["output", "└ Checked project state and tests"],
            ["tool", "• Ran npm test"],
            ["output", "└ 12 tests passed"],
            ["ok", "✓ Types clean"],
        ],
    },
    {
        id: "s3",
        label: "Gemini CLI",
        agent: "gemini",
        state: "attention",
        lines: [
            ["dim", "~/projects/orbit"],
            ["prompt", "› gemini"],
            ["", "Check the mobile preview."],
            ["", ""],
            ["ok", "✓ Cards fit at 390px"],
            ["warn", "! Choose the headline"],
            ["dim", "1) Gentle  2) Energetic"],
        ],
    },
    {
        id: "s4",
        label: "Terminal",
        agent: "terminal",
        state: "idle",
        lines: [
            ["dim", "~/projects/orbit"],
            ["prompt", "› npm run dev"],
            ["muted", "VITE · sample output"],
            ["ok", "✓ Local preview ready"],
            ["dim", "http://localhost:5173/"],
            ["", ""],
            ["ok", "› npm test · 3 checks passed"],
        ],
    },
];

const weekendSessions = [
    {
        id: "s5",
        label: "Gemini CLI",
        agent: "gemini",
        state: "idle",
        lines: [
            ["dim", "~/projects/weekend"],
            ["prompt", "› gemini"],
            ["", "Sketch a weekend planner."],
            ["", ""],
            ["muted", "· Compared three layouts"],
            ["ok", "✓ Map-first wireframe ready"],
            ["", ""],
            ["dim", "Ready for the next step."],
        ],
    },
    {
        id: "s6",
        label: "Terminal",
        agent: "terminal",
        state: "idle",
        lines: [
            ["dim", "~/projects/weekend"],
            ["prompt", "› npm run dev"],
            ["muted", "VITE · sample output"],
            ["ok", "✓ Local preview ready"],
            ["dim", "http://localhost:5173/"],
            ["", ""],
            ["muted", "Type help for sample commands."],
        ],
    },
];

export const demoProjects = [
    { id: "orbit", name: "Orbit", branch: "vibyra/orbit-build", sessions: orbitSessions },
    { id: "weekend", name: "Weekend project", branch: "vibyra/trip-planner", sessions: weekendSessions },
];

export const askTurns = [
    { role: "you", text: "What did the agents change while I was away?" },
    {
        role: "agent",
        text: "Claude Code added HabitCard.tsx and reworked TodayView.tsx so the day view stays calm at small sizes. The Orbit terminal is ready for your next step.",
    },
];

export const suggestions = [
    'Add a habit called "Go for a walk"',
    "Rename the title to \"Make time for you\"",
    "Add a weekly summary",
];

export const quickAgents = ["claude", "codex", "gemini", "terminal"];

// What a freshly started terminal shows when you pick an agent from the page.
export const startedLines = (agent, projectName = "Orbit") => ({
    label: providers[agent.id]?.name ?? agent.name,
    agent: agent.id,
    state: agent.id === "terminal" ? "idle" : "working",
    lines: agent.id === "claude" ? [
        ["prompt", "❯ Ready for your next task."],
        ["dim", agent.model ?? "Claude Opus 5.5"],
        ["dim", "Type help or ask Chat for a change."],
    ] : agent.id === "codex" ? [
        ["prompt", "› Ask Codex to do anything"],
        ["dim", agent.model ?? "GPT-6 Sol"],
        ["dim", "Type help or ask Chat for a change."],
    ] : [
        ["dim", `~/projects/${projectName.toLowerCase().replace(/\s+/g, "-")}`],
        ["prompt", `› ${providers[agent.id]?.command ?? agent.id}`],
        ["muted", `${providers[agent.id]?.name ?? agent.name} · sample session`],
        ["", ""],
        ["ok", "✓ Workspace ready"],
        ...(agent.model ? [["dim", `${agent.model}${agent.effort ? ` · ${agent.effort} effort` : ""}`]] : []),
        ...(agent.safe ? [["dim", "Safe mode · separate sample branch"]] : []),
        ["dim", agent.id === "terminal" ? "Type help to explore local commands." : "Type help or ask Chat for a change."],
    ],
});
