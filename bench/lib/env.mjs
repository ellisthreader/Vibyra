import { readFile } from "node:fs/promises";

// The OpenRouter key comes from the environment, or from a Laravel .env file.
export async function openRouterKey(envFile) {
    if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
    for (const file of [envFile, new URL("../../backend/.env", import.meta.url).pathname].filter(Boolean)) {
        try {
            const line = (await readFile(file, "utf8")).split("\n").find((l) => l.startsWith("OPENROUTER_API_KEY="));
            const key = line?.slice("OPENROUTER_API_KEY=".length).trim().replace(/^"|"$/g, "");
            if (key) return key;
        } catch {}
    }
    return null;
}

// Live list prices per 1M tokens, straight from OpenRouter's public catalogue.
export async function openRouterPricing() {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter models: ${res.status}`);
    const { data } = await res.json();
    return Object.fromEntries(data.map((m) => [m.id, {
        in: Number(m.pricing.prompt) * 1e6,
        out: Number(m.pricing.completion) * 1e6,
        context: m.context_length,
    }]));
}
