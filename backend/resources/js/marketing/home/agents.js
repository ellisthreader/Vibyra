// Logo assets: pinned Lobe Icons vectors; attribution is alongside the local SVGs.
export const agents = [
    { id: "claude", name: "Claude Code", company: "Anthropic", logo: "claude-color", kind: "Coding agent" },
    { id: "codex", name: "Codex", company: "OpenAI", logo: "openai", mono: true, kind: "Coding agent" },
    { id: "gemini", name: "Gemini CLI", company: "Google", logo: "gemini-color", kind: "Coding agent" },
    { id: "aider", name: "Aider", company: "Open source", logo: "aider", kind: "Coding agent" },
    { id: "opencode", name: "OpenCode", company: "Open source", logo: "opencode", mono: true, kind: "Coding agent" },
    { id: "qwen", name: "Qwen Code", company: "Qwen", logo: "qwen-color", kind: "Coding agent" },
    { id: "gpt", name: "GPT", company: "OpenAI", logo: "openai", mono: true, kind: "Model family" },
    { id: "glm", name: "GLM", company: "Z.ai", logo: "zai", mono: true, kind: "Model family" },
    { id: "grok", name: "Grok", company: "xAI", logo: "grok", mono: true, kind: "Model family" },
    { id: "kimi", name: "Kimi", company: "Moonshot AI", logo: "kimi-color", kind: "Model family" },
    { id: "deepseek", name: "DeepSeek", company: "DeepSeek", logo: "deepseek-color", kind: "Model family" },
    { id: "mistral", name: "Mistral", company: "Mistral AI", logo: "mistral-color", kind: "Model family" },
    { id: "llama", name: "Llama", company: "Meta", logo: "meta-color", kind: "Model family" },
    { id: "minimax", name: "MiniMax", company: "MiniMax", logo: "minimax-color", kind: "Model family" },
];

export const logoPath = (agent) => `/media/marketing/providers/${agent.logo}.svg`;
