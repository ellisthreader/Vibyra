// A stand-in model for tests and --mock runs: answers from a lookup so the
// whole pipeline can run offline and for free.
export function mockComplete(answers) {
    return async ({ model, messages }) => {
        const prompt = messages.at(-1).content;
        const hit = answers.find(([pattern]) => prompt.includes(pattern));
        const text = hit ? hit[1](model) : "I am not sure.";
        return { text, finish: "stop", provider: "mock", seconds: 0.5, ttft: 0.2, speed: 100,
            tokensIn: prompt.length / 4, tokensOut: text.length / 4, reasoningTokens: 0, cost: 0 };
    };
}
