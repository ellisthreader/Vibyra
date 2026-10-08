// Benchmark data for /benchmarks, gathered 2026-10-08 from the sources below.
// Scores are Artificial Analysis runs so every model is measured the same way.
// Intelligence: AA Intelligence Index v4.3. Coding: AA Coding Agent Index v1.5,
// which scores a model inside its own coding agent (codingAgent names the pair).
// Prices are USD per 1M tokens; blended is AA's 3 input : 1 output mix.
// Speed is median output tokens/s. null means not published; never estimate one.

export const AS_OF = "8 October 2026";
export const AS_OF_SHORT = "8 Oct 2026";

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
    {"id":"claude-opus-5-5","name":"Claude Opus 5.5","provider":"anthropic","released":"2026-09","openWeights":false,"intelligence":57.6223698102963,"coding":65.9885802549234,"scores":{"terminalbench4":59.5959595959596,"scicode":66.8981481481482,"hle":61.353104726598694,"gpqa":null,"lcr":84.6666666666667},"priceIn":4,"priceOut":20,"blended":8.0,"speed":95.2843756229738,"context":1000000,"snapshotVariant":"Claude Opus 5.5 (Max, Default Fallback)","effort":"max","codingAgent":"Claude Code - Opus 5.5 (max)"},
    {"id":"claude-fable-5-1","name":"Claude Fable 5.1","provider":"anthropic","released":"2026-09","openWeights":false,"intelligence":53.3549259623252,"coding":62.22249615769457,"scores":{"terminalbench4":52.020202020202,"scicode":63.078703703703695,"hle":59.1288229842447,"gpqa":93.7373737373737,"lcr":85.3333333333333},"priceIn":10,"priceOut":50,"blended":20.0,"speed":66.0642860658046,"context":1000000,"snapshotVariant":"Claude Fable 5.1 (Max, Default Fallback)","effort":"max","codingAgent":"Claude Code - Fable 5.1 (max) (with fallback)"},
    {"id":"claude-sonnet-5","name":"Claude Sonnet 5","provider":"anthropic","released":"2026-06","openWeights":false,"intelligence":38.1638712882576,"coding":null,"scores":{"terminalbench4":14.1414141414141,"scicode":54.2824074074074,"hle":41.2882298424467,"gpqa":91.1111111111111,"lcr":82.0},"priceIn":2,"priceOut":10,"blended":4.0,"speed":79.5884452873051,"context":1000000,"snapshotVariant":"Claude Sonnet 5 (Max)","effort":"max"},
    {"id":"claude-4-5-haiku-reasoning","name":"Claude Haiku 4.5","provider":"anthropic","released":"2025-10","openWeights":false,"intelligence":16.8822352291856,"coding":null,"scores":{"terminalbench4":0,"scicode":42.2453703703704,"hle":10.3799814643188,"gpqa":67.1717171717172,"lcr":74.3333333333333},"priceIn":1,"priceOut":5,"blended":2.0,"speed":90.4496961446117,"context":200000,"snapshotVariant":"Claude 4.5 Haiku (Reasoning)","effort":"unspecified"},
    {"id":"gpt-6-astra","name":"GPT-6 Astra","provider":"openai","released":"2026-09","openWeights":false,"intelligence":52.673669395513,"coding":61.64504498789397,"scores":{"terminalbench4":59.09090909090911,"scicode":56.4814814814815,"hle":54.6802594995366,"gpqa":96.0606060606061,"lcr":80.6666666666667},"priceIn":10,"priceOut":50,"blended":20.0,"speed":47.5570960019053,"context":1000000,"snapshotVariant":"GPT-6 Astra (Max)","effort":"max","codingAgent":"Codex - GPT-6 Astra (max)"},
    {"id":"gpt-6-sol","name":"GPT-6 Sol","provider":"openai","released":"2026-09","openWeights":false,"intelligence":47.6305176437724,"coding":56.662591275779974,"scores":{"terminalbench4":43.9393939393939,"scicode":57.63888888888889,"hle":47.914735866543104,"gpqa":null,"lcr":83.6666666666667},"priceIn":2,"priceOut":10,"blended":4.0,"speed":87.9431849204302,"context":1050000,"snapshotVariant":"GPT-6 Sol (Max)","effort":"max","codingAgent":"Codex - GPT-6 Sol (max)"},
    {"id":"gpt-6-luna","name":"GPT-6 Luna","provider":"openai","released":"2026-09","openWeights":false,"intelligence":38.1245186869738,"coding":41.07438934016153,"scores":{"terminalbench4":12.6262626262626,"scicode":54.6296296296296,"hle":38.5078776645042,"gpqa":null,"lcr":83.3333333333333},"priceIn":0.1,"priceOut":0.5,"blended":0.2,"speed":129.439459642438,"context":1000000,"snapshotVariant":"GPT-6 Luna (Max)","effort":"max","codingAgent":"Codex - GPT-6 Luna (max) ({'reasoning_effort': 'max'})"},
    {"id":"gemini-3-1-pro-preview","name":"Gemini 3.1 Pro Preview","provider":"google","released":"2026-02","openWeights":false,"intelligence":29.7185656132261,"coding":null,"scores":{"terminalbench4":4.04040404040404,"scicode":58.6805555555556,"hle":47.0342910101946,"gpqa":94.1414141414141,"lcr":82.0},"priceIn":2,"priceOut":12,"blended":4.5,"speed":121.761835391411,"context":1000000,"snapshotVariant":"Gemini 3.1 Pro Preview","effort":"unspecified"},
    {"id":"gemini-3-8-flash","name":"Gemini 3.8 Flash","provider":"google","released":"2026-09","openWeights":false,"intelligence":40.9262321765904,"coding":41.86315529449987,"scores":{"terminalbench4":19.6969696969697,"scicode":56.5972222222222,"hle":47.8220574606117,"gpqa":95.2525252525253,"lcr":81.3333333333333},"priceIn":0.75,"priceOut":3.75,"blended":1.5,"speed":125.191024595047,"context":1000000,"snapshotVariant":"Gemini 3.8 Flash (High)","effort":"high","codingAgent":"Antigravity SDK - Gemini 3.8 Flash (high)"},
    {"id":"grok-4-7","name":"Grok 4.7","provider":"xai","released":"2026-09","openWeights":false,"intelligence":46.4465506302286,"coding":56.26764360706693,"scores":{"terminalbench4":25.7575757575758,"scicode":57.4074074074074,"hle":43.1417979610751,"gpqa":null,"lcr":76.6666666666667},"priceIn":2,"priceOut":6,"blended":3.0,"speed":72.6463435656553,"context":500000,"snapshotVariant":"Grok 4.7 (Xhigh)","effort":"xhigh","codingAgent":"Grok Build - Grok 4.7 (xhigh)"},
    {"id":"muse-spark-1-3","name":"Muse Spark 1.3","provider":"meta","released":"2026-09","openWeights":false,"intelligence":48.0923107719685,"coding":54.30273329930766,"scores":{"terminalbench4":33.3333333333333,"scicode":58.796296296296305,"hle":48.7025023169602,"gpqa":93.53535353535351,"lcr":83.0},"priceIn":1.25,"priceOut":4.25,"blended":2.0,"speed":209.418180271887,"context":1000000,"snapshotVariant":"Muse Spark 1.3 (Max)","effort":"max","codingAgent":"Muse Code - Muse Spark 1.3 (max)"},
    {"id":"deepseek-v4-pro","name":"DeepSeek V4 Pro","provider":"deepseek","released":"2026-08","openWeights":true,"intelligence":35.9967791278402,"coding":43.05203524444174,"scores":{"terminalbench4":14.1414141414141,"scicode":51.0416666666667,"hle":41.0101946246525,"gpqa":92.82828282828281,"lcr":80.3333333333333},"priceIn":1.32,"priceOut":3.96,"blended":1.98,"speed":99.8233697367188,"context":1000000,"snapshotVariant":"DeepSeek V4 Pro 0813 (Max)","effort":"max","codingAgent":"Codex - DeepSeek V4 Pro 0813 (max)"},
    {"id":"deepseek-v4-1-flash","name":"DeepSeek V4.1 Flash","provider":"deepseek","released":"2026-09","openWeights":true,"intelligence":39.456167472527,"coding":null,"scores":{"terminalbench4":26.7676767676768,"scicode":51.851851851851805,"hle":39.2493049119555,"gpqa":null,"lcr":84.0},"priceIn":0.3,"priceOut":1.2,"blended":0.5249999999999999,"speed":216.113607903678,"context":1000000,"snapshotVariant":"DeepSeek V4.1 Flash (Max)","effort":"max"},
    {"id":"qwen3-8-max","name":"Qwen3.8 Max","provider":"alibaba","released":"2026-09","openWeights":false,"intelligence":45.4152084980521,"coding":43.26529641259874,"scores":{"terminalbench4":38.8888888888889,"scicode":52.0833333333333,"hle":43.0954587581094,"gpqa":92.82828282828281,"lcr":80.3333333333333},"priceIn":2,"priceOut":6,"blended":3.0,"speed":37.0453209628672,"context":983616,"snapshotVariant":"Qwen3.8 Max (0902)","effort":"unspecified","codingAgent":"Claude Code - Qwen3.8 Max"},
    {"id":"kimi-k3","name":"Kimi K3","provider":"moonshot","released":"2026-07","openWeights":true,"intelligence":43.5938229518782,"coding":51.9259105470924,"scores":{"terminalbench4":12.6262626262626,"scicode":59.4907407407407,"hle":46.8952734012975,"gpqa":93.53535353535351,"lcr":88.6666666666667},"priceIn":3,"priceOut":15,"blended":6.0,"speed":42.1867336493015,"context":1048576,"snapshotVariant":"Kimi K3 (Max)","effort":"max","codingAgent":"Kimi Code CLI - Kimi K3"},
    {"id":"glm-5-3","name":"GLM-5.3","provider":"zai","released":"2026-08","openWeights":true,"intelligence":44.777392385614,"coding":53.55484140097326,"scores":{"terminalbench4":41.9191919191919,"scicode":59.0277777777778,"hle":42.2613531047266,"gpqa":91.7171717171717,"lcr":79.6666666666667},"priceIn":1.4,"priceOut":4.4,"blended":2.15,"speed":79.3291205879638,"context":1000000,"snapshotVariant":"GLM-5.3 (Max)","effort":"max","codingAgent":"Opencode - GLM-5.3 ({'reasoning_effort': 'max'})"},
    {"id":"minimax-m3","name":"MiniMax-M3","provider":"minimax","released":"2026-06","openWeights":true,"intelligence":29.2202932236316,"coding":null,"scores":{"terminalbench4":2.02020202020202,"scicode":47.1064814814815,"hle":38.9712696941613,"gpqa":92.9292929292929,"lcr":83.0},"priceIn":0.3,"priceOut":1.2,"blended":0.5249999999999999,"speed":93.7551027768109,"context":1000000,"snapshotVariant":"MiniMax-M3","effort":"unspecified"},
    {"id":"mimo-v2-6-pro","name":"MiMo-V2.6-Pro","provider":"xiaomi","released":"2026-09","openWeights":true,"intelligence":46.3242065310383,"coding":null,"scores":{"terminalbench4":34.8484848484849,"scicode":60.8796296296296,"hle":49.351251158480096,"gpqa":null,"lcr":86.3333333333333},"priceIn":0.435,"priceOut":0.87,"blended":0.54375,"speed":37.578939615014,"context":1000000,"snapshotVariant":"MiMo-V2.6-Pro","effort":"unspecified"},
    {"id":"mistral-medium-3-5","name":"Mistral Medium 3.5","provider":"mistral","released":"2026-04","openWeights":true,"intelligence":14.1889227802691,"coding":null,"scores":{"terminalbench4":0,"scicode":40.162037037037,"hle":13.7627432808156,"gpqa":74.8484848484849,"lcr":69.3333333333333},"priceIn":1.5,"priceOut":7.5,"blended":3.0,"speed":168.114498787499,"context":256000,"snapshotVariant":"Mistral Medium 3.5","effort":"unspecified"},
    {"id":"gpt-6-1-sol","name":"GPT-6.1 Sol","provider":"openai","released":"2026-09","openWeights":false,"intelligence":51.8332597011541,"coding":60.14750704302517,"scores":{"terminalbench4":56.0606060606061,"scicode":54.1666666666667,"hle":52.919369786839695,"gpqa":null,"lcr":83.0},"priceIn":2,"priceOut":10,"blended":4.0,"speed":55.2166887882726,"context":1000000,"snapshotVariant":"GPT-6.1 Sol (Max)","effort":"max","codingAgent":"Codex - GPT-6.1 Sol (max)"},
    {"id":"claude-sonnet-5-5","name":"Claude Sonnet 5.5","provider":"anthropic","released":"2026-09","openWeights":false,"intelligence":56.0001286580794,"coding":68.35783373750832,"scores":{"terminalbench4":63.636363636363605,"scicode":60.9953703703704,"hle":54.9582947173309,"gpqa":null,"lcr":82.6666666666667},"priceIn":2,"priceOut":10,"blended":4.0,"speed":129.118765484437,"context":1000000,"snapshotVariant":"Claude Sonnet 5.5 (Max, Default Fallback)","effort":"max","codingAgent":"Claude Code - Sonnet 5.5 (max)"},
    {"id":"mimo-v2-6-flash","name":"MiMo-V2.6-Flash","provider":"xiaomi","released":"2026-09","openWeights":true,"intelligence":37.8843590141754,"coding":null,"scores":{"terminalbench4":22.727272727272698,"scicode":51.273148148148195,"hle":35.0787766450417,"gpqa":null,"lcr":74.3333333333333},"priceIn":0.14,"priceOut":0.28,"blended":0.17500000000000002,"speed":57.5349700791147,"context":1000000,"snapshotVariant":"MiMo-V2.6-Flash","effort":"unspecified"},
    {"id":"claude-haiku-5-5","name":"Claude Haiku 5.5","provider":"anthropic","released":"2026-10","openWeights":false,"intelligence":43.3950199670746,"coding":36.472609816886134,"scores":{"terminalbench4":32.8282828282828,"scicode":54.976851851851805,"hle":44.3929564411492,"gpqa":null,"lcr":82.6666666666667},"priceIn":0.1,"priceOut":0.5,"blended":0.2,"speed":241.913830264623,"context":1000000,"snapshotVariant":"Claude Haiku 5.5 (Max)","effort":"max","codingAgent":"Claude Code - Haiku 5.5 (max)"}
];
