import ShotScene from "./ShotScene.jsx";
import VoiceScene from "./VoiceScene.jsx";
import LanesScene from "./LanesScene.jsx";
import PreviewScene from "./PreviewScene.jsx";
import NotesScene from "./NotesScene.jsx";
import KeysScene from "./KeysScene.jsx";

/* The cards, in pairs, read left to right. Copy states what ships in the
 * desktop app today; platform limits live in the section's footnote. */
export const TILES = [
    {
        id: "shot",
        Scene: ShotScene,
        title: "Screenshot to prompt",
        copy: "Press F9, mark it up, drop it on a terminal.",
    },
    {
        id: "voice",
        Scene: VoiceScene,
        title: "Voice to prompt",
        copy: "Press F8 and just say it.",
    },
    {
        id: "lanes",
        Scene: LanesScene,
        title: "A lane for every agent",
        copy: "Every agent gets its own Git worktree.",
    },
    {
        id: "preview",
        Scene: PreviewScene,
        title: "Live preview",
        copy: "See your project on 46 phone, tablet, laptop and TV sizes.",
    },
    {
        id: "notes",
        Scene: NotesScene,
        title: "Your notes, for your agents",
        copy: "Your agents can read your Obsidian vault.",
    },
    {
        id: "keys",
        Scene: KeysScene,
        title: "No API keys",
        copy: "Sign in with Claude, ChatGPT or Gemini.",
    },
];
