import { providers } from "./demoData.js";
import { checkProject, validateConfig } from "./projectState.js";

// The homepage terminal responds only to local sample commands. It never
// launches a CLI, reads the visitor's files, or connects to an AI provider.
export function terminalSampleReply(command, session, project, data, changed) {
    const input = command.trim().toLowerCase();
    const path = `~/projects/${project.name.toLowerCase().replace(/\s+/g, "-")}`;
    const provider = providers[session?.agent] ?? providers.terminal;
    if (session?.agent === "gemini" && session.state === "attention" && ["1", "2"].includes(input)) {
        if (validateConfig(data.files["app.json"])) return { answer: "Fix app.json before choosing a sample headline." };
        return {
            answer: input === "1" ? "Gentle headline applied to the sample preview." : "Energetic headline applied to the sample preview.",
            previewTitle: input === "1" ? "A little better, every day." : "Make today count.",
            resolveAttention: true,
        };
    }
    if (input === "open preview" || input === "npm run dev") {
        return { answer: "Sample preview opened in the sidebar.", openTool: "preview" };
    }
    if (input === "open files") return { answer: "Sample files opened in the sidebar.", openTool: "files" };
    if (input === "npm test") {
        try { return { answer: checkProject(data).replaceAll("PASS", "✓").replaceAll("FAIL", "✗") }; }
        catch { return { answer: "✗ Sample project configuration could not be checked." }; }
    }
    const replies = {
        help: "Try: pwd · ls · git status · npm test · npm run dev · open preview · open files",
        pwd: path,
        ls: Object.keys(data.files).join("  "),
        whoami: `${provider.name} · ${provider.company} · sample session`,
        "git status": changed.length ? `${changed.length} modified sample file${changed.length === 1 ? "" : "s"}` : "Working tree clean",
        "git diff --stat": changed.length ? changed.map((name) => `${name} | sample edit`).join("\n") : "No sample changes to show.",
        "cat readme.md": data.files["README.md"],
    };
    return { answer: replies[input] ?? "Sample terminal only. Type help for local commands, or use Chat to edit the preview." };
}
