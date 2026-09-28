import ShotStory from "./ShotStory.jsx";
import VoiceStory from "./VoiceStory.jsx";
import SafeStory from "./SafeStory.jsx";
import AccountsStory from "./AccountsStory.jsx";

/* The four ecosystem cards, in pairs, read left to right. Copy states what
 * ships in the desktop app today; platform limits live in the footnote.
 * `cycle` is how often a story replays; `focus` crops its painted backdrop
 * (media/marketing/ecosystem/<id>.webp). */
export const CARDS = [
    {
        id: "shot",
        Story: ShotStory,
        cycle: 9.5,
        focus: "30% 40%",
        title: "Screenshot to prompt",
        copy: "Press F9, circle what looks wrong and drop it on your agent. It sees exactly what you see.",
    },
    {
        id: "voice",
        Story: VoiceStory,
        cycle: 9.5,
        focus: "50% 30%",
        title: "Voice to prompt",
        copy: "Press F8 and just say it. Vibyra types your words into the terminal for you.",
    },
    {
        id: "safe",
        Story: SafeStory,
        cycle: 9,
        focus: "60% 50%",
        title: "The safest way to code with agents",
        copy: "Safe mode gives every agent its own Git worktree, so nobody writes over anyone. Review, then merge.",
    },
    {
        id: "accounts",
        Story: AccountsStory,
        cycle: 8,
        focus: "50% 40%",
        title: "Connect all your accounts",
        copy: "Sign in with Claude, ChatGPT and Gemini, then plug in GitHub, Figma, Google and more. No API keys.",
    },
];
