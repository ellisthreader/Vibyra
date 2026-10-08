// Vibyra Instructions: strict, programmatically checked instruction following
// (private tasks in bench/private/instruct.mjs). Pass = every constraint met.
export const privatePath = new URL("../private/instruct.mjs", import.meta.url);

export default {
    id: "instruct",
    name: "Instructions",
    repeats: 3,
    tokensPerTask: 2000,
    description: "Vibyra's own private tasks with exact, checkable rules: formats, word counts, structure.",
    async load({ limit, file = privatePath }) {
        const tasks = (await import(file.href ?? file)).default;
        return tasks.slice(0, limit ?? tasks.length);
    },
    messages: (task) => [{ role: "user", content: task.prompt }],
    grade(task, text) {
        const failed = task.check(text);
        return { score: failed.length ? 0 : 1, detail: { failed } };
    },
};
