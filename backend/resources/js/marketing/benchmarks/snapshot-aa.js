// Benchmark data for /benchmarks, gathered 2026-09-23 from the sources below.
// Scores are Artificial Analysis runs so every model is measured the same way.
// Intelligence: AA Intelligence Index v4.3. Coding: AA Coding Agent Index v1.5,
// which scores a model inside its own coding agent (codingAgent names the pair).
// Prices are USD per 1M tokens; blended is AA's 3 input : 1 output mix.
// Speed is median output tokens/s. null means not published; never estimate one.

export const AS_OF = "23 September 2026";
export const AS_OF_SHORT = "23 Sep 2026";

export const SOURCES = [
    { name: "Artificial Analysis leaderboard", url: "https://artificialanalysis.ai/leaderboards/models" },
    { name: "Artificial Analysis Coding Agent Index", url: "https://artificialanalysis.ai/agents/coding-agents" },
    { name: "Anthropic: Introducing Claude Opus 5.5", url: "https://www.anthropic.com/claude-opus-5-5" },
];

export const PROVIDERS = {
    "anthropic": {
        "name": "Anthropic",
        "logo": "claude-color"
    },
    "openai": {
        "name": "OpenAI",
        "logo": "openai"
    },
    "google": {
        "name": "Google",
        "logo": "gemini-color"
    },
    "xai": {
        "name": "xAI",
        "logo": "grok"
    },
    "meta": {
        "name": "Meta",
        "logo": "meta-color"
    },
    "deepseek": {
        "name": "DeepSeek",
        "logo": "deepseek-color"
    },
    "alibaba": {
        "name": "Alibaba",
        "logo": "qwen-color"
    },
    "moonshot": {
        "name": "Moonshot AI",
        "logo": "kimi-color",
        "dark": true
    },
    "zai": {
        "name": "Z.ai",
        "logo": "zai"
    },
    "minimax": {
        "name": "MiniMax",
        "logo": "minimax-color"
    },
    "xiaomi": {
        "name": "Xiaomi"
    },
    "mistral": {
        "name": "Mistral",
        "logo": "mistral-color"
    }
};

export const BENCHMARKS = [
    {
        "id": "terminalbench4",
        "name": "Terminal-Bench 4.0",
        "description": "Agentic tasks completed in a real terminal: building, debugging, and operating software end to end.",
        "url": "https://www.tbench.ai/",
        "unit": "%",
        "short": "Terminal-Bench"
    },
    {
        "id": "scicode",
        "name": "SciCode",
        "description": "Writing code to solve research-level scientific computing problems.",
        "url": "https://scicode-bench.github.io/",
        "unit": "%",
        "short": "SciCode"
    },
    {
        "id": "hle",
        "name": "Humanity's Last Exam",
        "description": "Very hard expert-written questions across maths, science and humanities (no tools, AA run).",
        "url": "https://lastexam.ai/",
        "unit": "%",
        "short": "HLE"
    },
    {
        "id": "gpqa",
        "name": "GPQA Diamond",
        "description": "Graduate-level, Google-proof science multiple choice. Near saturation; AA dropped it from Index v4.3 so the newest models lack it.",
        "url": "https://arxiv.org/abs/2311.12022",
        "unit": "%",
        "short": "GPQA"
    },
    {
        "id": "lcr",
        "name": "AA-LCR",
        "description": "Artificial Analysis Long Context Reasoning: reasoning across ~100k-token document sets.",
        "url": "https://artificialanalysis.ai/evaluations/artificial-analysis-long-context-reasoning",
        "unit": "%",
        "short": "Long context"
    },
    {
        "id": "gdpval",
        "name": "GDPval-AA",
        "description": "Real-world knowledge-work tasks from 44 occupations, graded head-to-head; reported as an Elo-style rating.",
        "url": "https://artificialanalysis.ai/evaluations/gdpval-aa",
        "unit": "Elo",
        "short": "GDPval"
    }
];

export const MODELS = [
    {"id":"claude-opus-5-5","name":"Claude Opus 5.5","provider":"anthropic","released":"2026-09","openWeights":false,"intelligence":57.6,"coding":null,"scores":{"terminalbench4":59.6,"scicode":66.9,"hle":61.4,"gpqa":null,"lcr":84.7,"gdpval":1846.2},"priceIn":4,"priceOut":20,"blended":8,"speed":93,"context":1000000,"approx":["speed"]},
    {"id":"claude-fable-5-1","name":"Claude Fable 5.1","provider":"anthropic","released":"2026-09","openWeights":false,"intelligence":53.4,"coding":62.2,"scores":{"terminalbench4":52,"scicode":63.1,"hle":59.1,"gpqa":93.7,"lcr":85.3,"gdpval":1734.7},"priceIn":10,"priceOut":50,"blended":20,"speed":66,"context":1000000,"codingAgent":"Claude Code + Fable 5.1"},
    {"id":"claude-sonnet-5","name":"Claude Sonnet 5","provider":"anthropic","released":"2026-06","openWeights":false,"intelligence":38.2,"coding":null,"scores":{"terminalbench4":14.1,"scicode":54.3,"hle":41.3,"gpqa":91.1,"lcr":82,"gdpval":1449.2},"priceIn":2,"priceOut":10,"blended":4,"speed":79,"context":1000000},
    {"id":"claude-4-5-haiku-reasoning","name":"Claude Haiku 4.5","provider":"anthropic","released":"2025-10","openWeights":false,"intelligence":16.9,"coding":null,"scores":{"terminalbench4":0,"scicode":42.2,"hle":10.4,"gpqa":67.2,"lcr":74.3,"gdpval":718.9},"priceIn":1,"priceOut":5,"blended":2,"speed":109,"context":200000},
    {"id":"gpt-6-astra","name":"GPT-6 Astra","provider":"openai","released":"2026-09","openWeights":false,"intelligence":52.7,"coding":61.6,"scores":{"terminalbench4":59.1,"scicode":56.5,"hle":54.7,"gpqa":96.1,"lcr":80.7,"gdpval":1541.9},"priceIn":10,"priceOut":50,"blended":20,"speed":58,"context":1000000,"codingAgent":"Codex + GPT-6 Astra"},
    {"id":"gpt-6-sol","name":"GPT-6 Sol","provider":"openai","released":"2026-09","openWeights":false,"intelligence":47.5,"coding":56.7,"scores":{"terminalbench4":43.9,"scicode":57.6,"hle":47.9,"gpqa":null,"lcr":83.7,"gdpval":1486.9},"priceIn":2,"priceOut":10,"blended":4,"speed":131,"context":872000,"codingAgent":"Codex + GPT-6 Sol"},
    {"id":"gpt-6-luna","name":"GPT-6 Luna","provider":"openai","released":"2026-09","openWeights":false,"intelligence":37.3,"coding":41.1,"scores":{"terminalbench4":12.6,"scicode":54.6,"hle":38.5,"gpqa":null,"lcr":83.3,"gdpval":1367.1},"priceIn":0.1,"priceOut":0.5,"blended":0.2,"speed":162,"context":1000000,"codingAgent":"Codex + GPT-6 Luna"},
    {"id":"gemini-3-1-pro-preview","name":"Gemini 3.1 Pro Preview","provider":"google","released":"2026-02","openWeights":false,"intelligence":29.7,"coding":null,"scores":{"terminalbench4":4,"scicode":58.7,"hle":47,"gpqa":94.1,"lcr":82,"gdpval":776},"priceIn":2,"priceOut":12,"blended":4.5,"speed":116,"context":1000000},
    {"id":"gemini-3-8-flash","name":"Gemini 3.8 Flash","provider":"google","released":"2026-09","openWeights":false,"intelligence":40.9,"coding":41.9,"scores":{"terminalbench4":19.7,"scicode":56.6,"hle":47.8,"gpqa":95.3,"lcr":81.3,"gdpval":1412},"priceIn":0.75,"priceOut":3.75,"blended":1.5,"speed":287,"context":1000000,"codingAgent":"Antigravity SDK + Gemini 3.8 Flash"},
    {"id":"grok-4-7","name":"Grok 4.7","provider":"xai","released":"2026-09","openWeights":false,"intelligence":46.4,"coding":56.3,"scores":{"terminalbench4":25.8,"scicode":57.4,"hle":43.1,"gpqa":null,"lcr":76.7,"gdpval":1695.2},"priceIn":2,"priceOut":6,"blended":3,"speed":39,"context":500000,"codingAgent":"Grok Build + Grok 4.7"},
    {"id":"muse-spark-1-3","name":"Muse Spark 1.3","provider":"meta","released":"2026-09","openWeights":false,"intelligence":48.1,"coding":54.3,"scores":{"terminalbench4":33.3,"scicode":58.8,"hle":48.7,"gpqa":93.5,"lcr":83,"gdpval":1674.1},"priceIn":1.25,"priceOut":4.25,"blended":2,"speed":223,"context":1000000,"codingAgent":"Muse Code + Muse Spark 1.3"},
    {"id":"deepseek-v4-pro","name":"DeepSeek V4 Pro","provider":"deepseek","released":"2026-08","openWeights":true,"intelligence":36,"coding":43.1,"scores":{"terminalbench4":14.1,"scicode":51,"hle":41,"gpqa":92.8,"lcr":80.3,"gdpval":1441.4},"priceIn":1.32,"priceOut":3.96,"blended":1.98,"speed":67,"context":1000000,"codingAgent":"Codex + DeepSeek V4 Pro 0813"},
    {"id":"deepseek-v4-1-flash","name":"DeepSeek V4.1 Flash","provider":"deepseek","released":"2026-09","openWeights":true,"intelligence":39.5,"coding":null,"scores":{"terminalbench4":26.8,"scicode":51.9,"hle":39.2,"gpqa":null,"lcr":84,"gdpval":1600},"priceIn":0.3,"priceOut":1.2,"blended":0.525,"speed":232,"context":1000000},
    {"id":"qwen3-8-max","name":"Qwen3.8 Max","provider":"alibaba","released":"2026-09","openWeights":false,"intelligence":45.4,"coding":43.3,"scores":{"terminalbench4":38.9,"scicode":52.1,"hle":43.1,"gpqa":92.8,"lcr":80.3,"gdpval":1667.7},"priceIn":2,"priceOut":6,"blended":3,"speed":39,"context":983616,"codingAgent":"Claude Code + Qwen3.8 Max"},
    {"id":"kimi-k3","name":"Kimi K3","provider":"moonshot","released":"2026-07","openWeights":true,"intelligence":43.6,"coding":51.9,"scores":{"terminalbench4":12.6,"scicode":59.5,"hle":46.9,"gpqa":93.5,"lcr":88.7,"gdpval":1524},"priceIn":3,"priceOut":15,"blended":6,"speed":37,"context":1048576,"codingAgent":"Kimi Code CLI + Kimi K3"},
    {"id":"glm-5-3","name":"GLM-5.3","provider":"zai","released":"2026-08","openWeights":true,"intelligence":44.8,"coding":53.6,"scores":{"terminalbench4":41.9,"scicode":59,"hle":42.3,"gpqa":91.7,"lcr":79.7,"gdpval":1645.5},"priceIn":1.4,"priceOut":4.4,"blended":2.15,"speed":61,"context":1000000,"codingAgent":"Opencode + GLM-5.3"},
    {"id":"minimax-m3","name":"MiniMax-M3","provider":"minimax","released":"2026-06","openWeights":true,"intelligence":29.2,"coding":null,"scores":{"terminalbench4":2,"scicode":47.1,"hle":39,"gpqa":92.9,"lcr":83,"gdpval":1230.1},"priceIn":0.3,"priceOut":1.2,"blended":0.525,"speed":106,"context":1000000},
    {"id":"mimo-v2-6-pro","name":"MiMo-V2.6-Pro","provider":"xiaomi","released":"2026-09","openWeights":true,"intelligence":46.3,"coding":null,"scores":{"terminalbench4":34.8,"scicode":60.9,"hle":49.4,"gpqa":null,"lcr":86.3,"gdpval":1673.2},"priceIn":0.435,"priceOut":0.87,"blended":0.544,"speed":54,"context":1000000},
    {"id":"mistral-medium-3-5","name":"Mistral Medium 3.5","provider":"mistral","released":"2026-04","openWeights":true,"intelligence":14.2,"coding":null,"scores":{"terminalbench4":0,"scicode":40.2,"hle":13.8,"gpqa":74.8,"lcr":69.3,"gdpval":747.1},"priceIn":1.5,"priceOut":7.5,"blended":3,"speed":141,"context":256000},
];
