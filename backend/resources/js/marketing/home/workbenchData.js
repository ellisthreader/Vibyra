/* The cutaway shows a follow-on task in the same Orbit project the hero starts,
 * so the page reads as one continuous session rather than two unrelated demos. */

export const SESSIONS = [
    { name: "Claude Code", state: "running", badge: "1" },
    { name: "Codex", state: "running", badge: "2" },
    { name: "Notes", state: "idle", badge: "" },
];

export const TERMINALS = [
    {
        agent: "Claude Code",
        mark: "✳",
        tone: "claude",
        cwd: "~/projects/orbit",
        cmd: "claude",
        prompt: "Add a weekly summary to the habit view.",
        lines: [
            { text: "· Reading TodayView.tsx", tone: "dim" },
            { text: "✓ WeekSummary.tsx", tone: "ok", meta: "+64" },
            { text: "✓ TodayView.tsx", tone: "ok", meta: "+12" },
            { text: "· Preview reloaded", tone: "dim" },
        ],
    },
    {
        agent: "Codex",
        mark: "›_",
        tone: "codex",
        cwd: "~/projects/orbit",
        cmd: "codex",
        prompt: "Cover the new summary with tests.",
        lines: [
            { text: "· Running the suite", tone: "dim" },
            { text: "✓ 8 tests passed", tone: "ok" },
            { text: "✓ No type errors", tone: "ok" },
            { text: "· 94% covered", tone: "dim" },
        ],
    },
];

export const HABITS = [
    { mark: "↗", tone: "green", name: "A little movement", note: "20 minutes, just for you", done: true },
    { mark: "≈", tone: "blue", name: "Stay hydrated", note: "One glass at a time", done: false },
    { mark: "◷", tone: "green", name: "Wind down", note: "Ten quiet minutes", done: false },
];

export const WEEK = [24, 38, 26, 49, 36, 62, 74];
