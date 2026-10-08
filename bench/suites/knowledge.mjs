import { hfRows, sample } from "../lib/datasets.mjs";
import { choice } from "../lib/extract.mjs";

// Options are shuffled per attempt (seeded), so position bias averages out.
function order(task, attempt) {
    let s = attempt * 7919 + task.id.length * 104729 + 1;
    const rand = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    return attempt === 0 ? task.options.map((_, i) => i) : task.options.map((_, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

const LETTERS = "ABCDEFGHIJ";

// MMLU-Pro: expert multiple choice with ten options (guessing scores 10%).
// A fixed seeded sample of 200 keeps the cost down and the set stable.
export default {
    id: "knowledge",
    name: "Knowledge",
    repeats: 1,
    tokensPerTask: 4000,
    description: "200 expert questions from MMLU-Pro across 14 subjects, ten options each.",
    async load({ limit = 200 }) {
        const rows = sample(await hfRows("TIGER-Lab/MMLU-Pro", { split: "test" }), Math.min(limit, 200));
        return rows.map((r) => ({ id: `mmlupro-${r.question_id}`, question: r.question, options: r.options, answer: r.answer, subject: r.category }));
    },
    messages: (task, attempt = 0) => [{
        role: "user",
        content: `${task.question}\n\n${order(task, attempt).map((o, i) => `${LETTERS[i]}. ${task.options[o]}`).join("\n")}\n\n`
            + "Choose the single best option. End your reply with a final line in exactly this form:\nANSWER: <letter>",
    }],
    grade(task, text, attempt = 0) {
        const got = choice(text, LETTERS.slice(0, task.options.length));
        const want = LETTERS[order(task, attempt).indexOf(LETTERS.indexOf(task.answer))];
        return { score: got === want ? 1 : 0, detail: { got, want } };
    },
};
