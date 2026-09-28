/* Section 02's phone plays one looping story in three scenes. Everything the
 * phone shows is derived from a clock (ms into the cycle): the phase names
 * what is on screen, and the typed / streamed counts fall out of the time
 * since their phase began. Keeping it all in one table means the step tabs,
 * the progress bar and the phone can never disagree about where we are. */

export const CYCLE = 15800;

export const scenes = [
    {
        id: "open",
        at: 0,
        title: "Open your project",
        text: "The same project and open work, ready where you left off.",
    },
    {
        id: "ask",
        at: 3300,
        title: "Say what you want",
        text: "Give an instruction on your phone. Watch the answer arrive on both screens.",
    },
    {
        id: "land",
        at: 8500,
        title: "Watch it land",
        text: "Your Mac does the work. See the change land and the checks pass.",
    },
    {
        id: "live",
        at: 9600,
        title: "See it live",
        text: "Open the site running on your Mac and try it on your phone.",
    },
];

/* Phases in cycle order. `key` becomes `data-phase` on the phone and the
 * scene index becomes `data-scene`, and the stylesheet does the rest. */
export const phases = [
    { at: 0, key: "rail" },
    { at: 850, key: "tap" },
    { at: 1250, key: "reveal" },
    { at: 3300, key: "compose" },
    { at: 5000, key: "sent" },
    { at: 5300, key: "thinking" },
    { at: 5700, key: "stream" },
    { at: 7500, key: "card" },
    { at: 8500, key: "done" },
    { at: 9600, key: "live" },
    { at: 10700, key: "tap-live" },
    { at: 11100, key: "site" },
    { at: 12700, key: "tick1" },
    { at: 13300, key: "tick2" },
    { at: 13900, key: "tick3" },
];

export const typing = { at: 3400, perChar: 38 };
export const streaming = { at: 5700, perWord: 70 };

export const instruction = "Let’s make the habits page feel simpler.";
export const reply =
    "I’ve cut the navigation down to one Today page. Your habits and progress sit together, with everything else tucked away until you need it.";

/* The finished frame: what the phone shows when motion is reduced, and the
 * point each step tab lands on when the visitor picks it by hand. */
export const stillPhase = "card";

/* The live site: the hero’s Orbit sample, as it runs on the Mac. Each tick
 * phase checks off one more habit. */
export const site = {
    address: "localhost:3000",
    title: "Small steps. Good things.",
    habits: ["A little movement", "Stay hydrated", "Read for ten minutes"],
};

export const rows = [
    { id: "nav", title: "Simplify the navigation", state: "" },
    { id: "auth", title: "Improve sign-in", state: "attention" },
    { id: "api", title: "Build the project API", state: "running" },
    { id: "tests", title: "Test the new navigation", state: "running" },
    { id: "docs", title: "Update the documentation", state: "" },
];

export function storyAt(t) {
    const time = ((t % CYCLE) + CYCLE) % CYCLE;
    let phase = phases[0];
    for (const p of phases) if (p.at <= time) phase = p;
    let scene = 0;
    scenes.forEach((s, i) => {
        if (s.at <= time) scene = i;
    });
    const next = scenes[scene + 1]?.at ?? CYCLE;
    const typed = Math.max(0, Math.min(instruction.length, Math.floor((time - typing.at) / typing.perChar)));
    const words = reply.split(" ");
    const streamed = Math.max(0, Math.min(words.length, Math.floor((time - streaming.at) / streaming.perWord)));
    return {
        phase: phase.key,
        scene,
        progress: (time - scenes[scene].at) / (next - scenes[scene].at),
        typed: phase.key === "compose" ? typed : 0,
        streamed: phase.at >= streaming.at ? (phase.key === "stream" ? streamed : words.length) : 0,
    };
}

export const stillStory = { phase: stillPhase, scene: 1, progress: 1, typed: 0, streamed: reply.split(" ").length };
