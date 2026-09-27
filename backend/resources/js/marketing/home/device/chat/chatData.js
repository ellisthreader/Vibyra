// Sample conversations for the device's Chat Mode. Illustrative only - never
// presented as a live model. Copy follows desktop-tauri ChatMode.tsx and
// ChatEmpty.tsx: a detached chat has no project and no folder until you give
// it one, and answers are plain prose rather than bubbles.

export const chatEmpty = {
    title: "Start a chat",
    body: "A detached chat has no project and no folder until you give it one.",
};

// TaskStarters.tsx: a starting point you edit before sending.
export const chatStarters = [
    ["Think an idea through", "Talk it out before it becomes a project."],
    ["Explain something", "Get a plain answer without opening a repo."],
    ["Draft the words", "A README, a release note, a name."],
];

export const chatReach =
    "Detached — no project, no folder, no memory. Give this chat a folder when it needs something to read.";

export const sampleChats = [
    {
        id: "c1",
        title: "Audit the latest release",
        turns: [
            { role: "you", text: "We shipped the habit tracker to a few friends. What should I look at first?" },
            {
                role: "agent",
                text: "Start with the first five minutes. Open it the way a new person would, and write down every moment you had to stop and think. That list is your release audit — shorter and more honest than a feature review.\n\nThen watch one number: how many people came back on day two. Everything else can wait a week.",
            },
        ],
    },
    {
        id: "c2",
        title: "Weekend ideas",
        turns: [
            { role: "you", text: "I have two free days and no plan. Something small I can actually finish?" },
            {
                role: "agent",
                text: "Pick something with one screen. A packing list, a reading log, a countdown to something you care about. One screen means you can finish it, and finishing is the part that makes you want to build the next one.",
            },
        ],
    },
];

// Canned answers, chosen by what the message is about. The fallback keeps the
// same tone so a typed message never falls flat.
const replies = [
    [
        /\bname|naming|call it\b/i,
        "Say what it does out loud, then cut it in half. Short names leave room for the product to grow into them. Say the shortlist to someone before you commit — the one you say without hesitating is the one.",
    ],
    [
        /\bcalm|simple|clean|minimal|feel\b/i,
        "Calm is mostly restraint. One clear action per screen, generous space, and nothing that moves unless it is telling you something. Then take one more thing away — it is almost always still better.",
    ],
    [
        /\bworktree|git|branch|review\b/i,
        "A worktree is a second copy of your repo on another branch, in its own folder. Both share one history, so an agent can work in its worktree while yours stays untouched — and you read the difference before any of it comes back.",
    ],
    [
        /\bhabit|tracker|streak\b/i,
        "Make showing up feel good and the streaks take care of themselves. Track one thing on the first screen, celebrate the second day harder than the thirtieth, and never punish a miss — that is the day most trackers lose people.",
    ],
    [
        /\bidea|build|start|project|make\b/i,
        "Write the one sentence a friend would use to describe it, then build only what that sentence promises. Once the first version is real you will know what the second one should be, and that is much cheaper than guessing now.",
    ],
    [
        /\breadme|write|draft|note\b/i,
        "Open with what it does in one line, then why someone would want it, then how to run it. Three short sections beat one long one — most people are scanning for the command, not reading prose.",
    ],
];

export const chatReply = (text) => {
    const match = replies.find(([pattern]) => pattern.test(text));
    if (match) return match[1];
    return "Good place to start. Tell me what it should feel like when it works, and we can shape a first version around that — a small one you could finish this week.";
};

// A new chat is named after the first thing you say to it, like the app does.
export const chatTitle = (text) => {
    const clean = text.trim().replace(/\s+/g, " ");
    return clean.length > 30 ? `${clean.slice(0, 30).trimEnd()}…` : clean;
};
