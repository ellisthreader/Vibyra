import { hfRows } from "../lib/datasets.mjs";
import { integer } from "../lib/extract.mjs";

// AIME 2026: 30 competition problems with integer answers 0–999, graded exactly.
// Recent enough that most models trained before it; rotate to next year's paper.
export default {
    id: "math",
    name: "Maths",
    repeats: 3,
    tokensPerTask: 16000,
    description: "The 30 AIME 2026 competition problems. Each answer is a whole number, marked exactly.",
    async load({ limit }) {
        const rows = await hfRows("MathArena/aime_2026", { split: "train", limit });
        return rows.map((r) => ({ id: `aime26-${r.problem_idx}`, problem: r.problem, answer: Number(r.answer) }));
    },
    messages: (task) => [{
        role: "user",
        content: `${task.problem}\n\nSolve the problem. The answer is an integer from 0 to 999. `
            + "End your reply with a final line in exactly this form:\nANSWER: <integer>",
    }],
    grade(task, text) {
        const got = integer(text);
        return { score: got === task.answer ? 1 : 0, detail: { got, want: task.answer } };
    },
};
