// One streaming call through OpenRouter, timed the way we publish it:
// ttft = first answer token (thinking included), speed = answer+reasoning
// tokens per second after the first token, cost = OpenRouter's billed usage.
const URL = "https://openrouter.ai/api/v1/chat/completions";

export async function complete({ model, messages, effort, maxTokens = 32000, key, signal }) {
    const started = performance.now();
    const body = {
        model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature: effort ? undefined : 0,
        usage: { include: true },
        ...(effort ? { reasoning: { effort } } : {}),
    };
    const res = await fetch(URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://vibyra.com/benchmarks",
            "X-Title": "Vibyra Bench",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const error = new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
        error.retryable = res.status === 429 || res.status >= 500;
        throw error;
    }
    let text = "";
    let firstByte = null;
    let firstAnswer = null;
    let usage = null;
    let provider = null;
    let finish = null;
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            const event = JSON.parse(line.slice(6));
            if (event.error) throw Object.assign(new Error(event.error.message), { retryable: true });
            provider ??= event.provider;
            usage = event.usage ?? usage;
            const choice = event.choices?.[0];
            finish = choice?.finish_reason ?? finish;
            const delta = choice?.delta ?? {};
            if ((delta.reasoning || delta.content) && firstByte == null) firstByte = performance.now();
            if (delta.content) {
                firstAnswer ??= performance.now();
                text += delta.content;
            }
        }
    }
    const ended = performance.now();
    const outTokens = usage?.completion_tokens ?? 0;
    const streamSeconds = firstByte ? (ended - firstByte) / 1000 : 0;
    return {
        text,
        finish,
        provider,
        seconds: (ended - started) / 1000,
        ttft: firstAnswer ? (firstAnswer - started) / 1000 : null,
        speed: streamSeconds > 0.2 && outTokens ? outTokens / streamSeconds : null,
        tokensIn: usage?.prompt_tokens ?? 0,
        tokensOut: outTokens,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        cost: usage?.cost ?? null,
    };
}
