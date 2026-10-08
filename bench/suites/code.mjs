import { readFile } from "node:fs/promises";
import { codeBlock } from "../lib/extract.mjs";
import { runPython } from "../lib/sandbox.mjs";

// Vibyra Code: our own held-out tasks (bench/private/code.json, never public).
// "write" tasks ask for a function; "fix" tasks show a small project with a
// bug and ask for the corrected file. Hidden tests run in the sandbox.
export const privatePath = new URL("../private/code.json", import.meta.url);

export default {
    id: "code",
    name: "Coding",
    repeats: 3,
    tokensPerTask: 8000,
    description: "Vibyra's own private coding tasks: write functions and fix bugs in small projects, checked by hidden tests.",
    async load({ limit, file = privatePath }) {
        const tasks = JSON.parse(await readFile(file, "utf8"));
        return tasks.slice(0, limit ?? tasks.length);
    },
    messages(task) {
        const files = Object.entries(task.files ?? {})
            .map(([name, body]) => `--- ${name} ---\n${body}`).join("\n\n");
        const ask = task.kind === "fix"
            ? `This project has a bug. ${task.prompt}\n\n${files}\n\nReply with the complete corrected ${task.target} in one \`\`\`python block.`
            : `${task.prompt}\n\nReply with the complete solution in one \`\`\`python block. Use only the standard library.`;
        return [{ role: "user", content: ask }];
    },
    async grade(task, text) {
        const code = codeBlock(text);
        if (!code) return { score: 0, detail: { error: "no code block" } };
        const target = task.kind === "fix" ? task.target : "solution.py";
        const result = await runPython({ ...(task.files ?? {}), [target]: code, "test_hidden.py": task.tests }, "test_hidden.py");
        return { score: result.ok ? 1 : 0, detail: { timedOut: result.timedOut, output: result.ok ? "" : result.output.slice(-600) } };
    },
};
