/* "See preview" plays four short chapters on a phone drawn in code. Each
 * chapter's motion is CSS keyed to --tour-dur, and the chapter list's progress
 * bar runs for the same duration, so its animationend is what advances the
 * tour: pausing one pauses both, and they can never drift apart. */

/* Every beat below is written at 1×; the phone plays them SPEED times faster. */
export const SPEED = 1.2;

export const chapters = [
    {
        id: "projects",
        title: "Pick up where you left off",
        text: "Every project and terminal on your Mac, waiting on your phone.",
        duration: 5200,
    },
    {
        id: "terminal",
        title: "Same terminal, live",
        text: "The Claude Code session on your Mac, in your hand. Tap, type, and the answer streams back.",
        duration: 8200,
    },
    {
        id: "cloud",
        title: "Carry on in Vibyra Cloud",
        text: "Close the lid and the same conversation moves to Vibyra Cloud. Same terminal, same history, still going.",
        duration: 8200,
    },
    {
        id: "away",
        title: "Away from your desk",
        text: "A nudge when the work is done, and Face ID before anyone gets back in.",
        duration: 6200,
    },
];

/* What a screen reader hears for the phone in each chapter. */
export const phoneLabels = {
    projects: "Phone showing the Orbit project with four terminals, connected to Ellis’s MacBook.",
    terminal: "Phone showing the Claude Code session running on Ellis’s MacBook. The instruction make Good things green is typed on the iPhone keyboard, and Claude updates src/hero.css.",
    cloud: "The MacBook goes offline. Continue in Cloud moves the same Claude Code conversation to Vibyra Cloud, where it runs the tests: 12 passed.",
    away: "Phone lock screen with a Vibyra notification that the work finished in Vibyra Cloud, then Face ID.",
};
